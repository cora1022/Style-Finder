import { useEffect, useState } from 'react'

const lines = ['이 옷,', '어디서 팔지?']
const totalCharacters = lines.join('').length
const motionQuery = '(prefers-reduced-motion: reduce)'

export function HeroTitle() {
  const [visibleCharacters, setVisibleCharacters] = useState(() =>
    window.matchMedia?.(motionQuery).matches ? totalCharacters : 0,
  )

  useEffect(() => {
    const preference = window.matchMedia?.(motionQuery)
    let timer: number | undefined
    let count = 0
    const typeNext = () => {
      count += 1
      setVisibleCharacters(count)
      if (count < totalCharacters)
        timer = window.setTimeout(typeNext, count === lines[0].length ? 300 : 120)
    }
    if (!preference?.matches) timer = window.setTimeout(typeNext, 250)
    const finish = (event: MediaQueryListEvent) => {
      if (event.matches) {
        window.clearTimeout(timer)
        setVisibleCharacters(totalCharacters)
      }
    }
    preference?.addEventListener('change', finish)
    return () => {
      window.clearTimeout(timer)
      preference?.removeEventListener('change', finish)
    }
  }, [])

  return (
    <h1 id="home-title" aria-label={lines.join(' ')}>
      {lines.map((line, index) => {
        const offset = index === 0 ? 0 : lines[0].length
        const count = Math.max(0, Math.min(line.length, visibleCharacters - offset))
        const typing =
          (count > 0 && count < line.length) ||
          (index === 0 && visibleCharacters === lines[0].length)
        return (
          <span className="hero-title-line" aria-hidden="true" key={line}>
            <span className="hero-title-measure">{line}</span>
            <span className="hero-title-text">
              {line.slice(0, count)}
              {typing && <span className="hero-type-caret" />}
            </span>
          </span>
        )
      })}
    </h1>
  )
}
