"""OpenCV 중심 이미지 전처리 서비스.

이 프로젝트에서 이미지 검색은 원본 이미지를 바로 FashionCLIP에 넣지 않고,
OpenCV/YOLO로 의류 관심 영역을 먼저 분리한 뒤 임베딩한다. 이 파일은
그 전처리 단계를 담당한다.

주요 흐름:
1. 업로드 bytes를 PIL RGB 이미지로 decode
2. numpy array로 변환
3. OpenCV 처리를 위해 RGB -> BGR 변환
4. YOLO clothing detector 또는 OpenCV fallback detector로 bounding box 탐지
5. padding과 좌표 보정 후 의류 영역 crop
6. crop_applied, detector, crop_box metadata 반환
"""

from io import BytesIO
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError

from backend.app.services.fashionclip_service import InvalidImageError


def _decode_image(image_bytes: bytes) -> Image.Image:
    try:
        return Image.open(BytesIO(image_bytes)).convert("RGB")
    except (UnidentifiedImageError, OSError) as exc:
        raise InvalidImageError("Invalid image file.") from exc


class OpenCvCropService:
    """FashionCLIP 임베딩 전에 의류 영역을 추출하는 핵심 전처리 계층."""

    def __init__(
        self,
        enabled: bool = True,
        cascade_path: str | None = None,
        yolo_model_path: str | None = None,
        yolo_confidence: float = 0.25,
    ):
        self.enabled = enabled
        self.cascade_path = cascade_path
        self.yolo_model_path = yolo_model_path
        self.yolo_confidence = yolo_confidence
        self.cascade = None
        self.hog = None
        self.yolo_model = None

    def load(self) -> None:
        if not self.enabled:
            return

        if self.yolo_model_path and Path(self.yolo_model_path).exists():
            from ultralytics import YOLO

            self.yolo_model = YOLO(self.yolo_model_path)
            return

        if self.cascade_path:
            cascade = cv2.CascadeClassifier(self.cascade_path)
            if cascade.empty():
                raise RuntimeError(f"Could not load OpenCV cascade: {self.cascade_path}")
            self.cascade = cascade
            return

        self.hog = cv2.HOGDescriptor()
        self.hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def crop_image_bytes(self, image_bytes: bytes) -> Image.Image:
        cropped_image, _metadata = self.crop_image_bytes_with_metadata(image_bytes)
        return cropped_image

    def crop_image_bytes_with_metadata(self, image_bytes: bytes) -> tuple[Image.Image, dict]:
        image = _decode_image(image_bytes)

        metadata = {
            "crop_applied": False,
            "original_width": image.width,
            "original_height": image.height,
            "detector": self._detector_name(),
            "crop_box": {
                "x": 0,
                "y": 0,
                "width": image.width,
                "height": image.height,
            },
        }

        if not self.enabled:
            return image, metadata

        array = np.array(image)
        bgr = cv2.cvtColor(array, cv2.COLOR_RGB2BGR)

        # OpenCV/YOLO detector로 검색에 필요한 의류 관심 영역을 먼저 찾는다.
        box = self._detect_box(image, bgr)
        if box is None:
            return image, metadata

        # 탐지 box를 약간 확장해 소매/밑단이 잘리지 않도록 보정한다.
        x, y, width, height = self._expand_box(box, image.width, image.height)
        cropped = image.crop((x, y, x + width, y + height))

        metadata["crop_applied"] = True
        metadata["detector"] = self._detector_name()
        metadata["crop_box"] = {
            "x": x,
            "y": y,
            "width": width,
            "height": height,
        }
        return cropped, metadata

    def _detect_box(self, image: Image.Image, bgr_image) -> tuple[int, int, int, int] | None:
        if self.yolo_model is not None:
            return self._detect_yolo_box(image)

        if self.cascade is not None:
            gray = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)
            boxes = self.cascade.detectMultiScale(
                gray,
                scaleFactor=1.08,
                minNeighbors=4,
                minSize=(48, 48),
            )
            return self._largest_box(boxes)

        if self.hog is None:
            return None

        boxes, _weights = self.hog.detectMultiScale(
            bgr_image,
            winStride=(8, 8),
            padding=(16, 16),
            scale=1.05,
        )
        person_box = self._largest_box(boxes)
        if person_box is None:
            return None

        x, y, width, height = person_box
        upper_height = int(height * 0.72)
        return x, y, width, max(upper_height, 1)

    def _detect_yolo_box(self, image: Image.Image) -> tuple[int, int, int, int] | None:
        results = self.yolo_model.predict(
            source=image,
            conf=self.yolo_confidence,
            verbose=False,
        )
        if not results:
            return None

        result = results[0]
        boxes = getattr(result, "boxes", None)
        if boxes is None or len(boxes) == 0:
            return None

        names = getattr(result, "names", {}) or getattr(self.yolo_model, "names", {})
        clothing_candidates = []
        clothing_terms = {
            "clothing", "cloth", "shirt", "top", "t-shirt", "tee", "blouse",
            "sweater", "hoodie", "jacket", "coat", "dress", "skirt", "pants",
            "trousers", "shorts", "jeans", "cardigan", "vest",
        }

        for detected_box in boxes:
            xyxy = detected_box.xyxy[0].detach().cpu().numpy()
            class_id = int(detected_box.cls[0].item()) if detected_box.cls is not None else -1
            class_name = str(names.get(class_id, class_id)).lower()
            confidence = (
                float(detected_box.conf[0].item()) if detected_box.conf is not None else 0.0
            )
            x1, y1, x2, y2 = [int(round(value)) for value in xyxy]
            width = max(1, x2 - x1)
            height = max(1, y2 - y1)
            area = width * height
            item = (x1, y1, width, height, area, confidence)

            if any(term in class_name for term in clothing_terms):
                clothing_candidates.append(item)

        if not clothing_candidates:
            return None
        selected = max(clothing_candidates, key=lambda item: item[4] * item[5])
        return selected[0], selected[1], selected[2], selected[3]

    def _detector_name(self) -> str:
        if self.yolo_model is not None:
            return "yolo_clothing"
        if self.cascade is not None:
            return "opencv_cascade"
        if self.hog is not None:
            return "opencv_hog_person_upper_body"
        return "disabled"

    def _largest_box(self, boxes) -> tuple[int, int, int, int] | None:
        if boxes is None or len(boxes) == 0:
            return None

        return max(
            ((int(x), int(y), int(width), int(height)) for x, y, width, height in boxes),
            key=lambda box: box[2] * box[3],
        )

    def _expand_box(
        self,
        box: tuple[int, int, int, int],
        image_width: int,
        image_height: int,
    ) -> tuple[int, int, int, int]:
        x, y, width, height = box
        pad_x = int(width * 0.12)
        pad_y = int(height * 0.10)

        left = max(0, x - pad_x)
        top = max(0, y - pad_y)
        right = min(image_width, x + width + pad_x)
        bottom = min(image_height, y + height + pad_y)

        return left, top, max(1, right - left), max(1, bottom - top)
