export async function withMinimumDuration<T>(
  operation: Promise<T>,
  milliseconds = 5200,
): Promise<T> {
  const [result] = await Promise.all([
    operation,
    new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds)),
  ])
  return result
}
