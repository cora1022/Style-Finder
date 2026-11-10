const tracks = [
  ['t11', 't02', 't05', 't03', 't06', 't10', 't13', 'b01'],
  ['t08', 't06', 'b02', 't02', 't11', 't13', 't05', 't03'],
  ['t13', 't06', 't11', 't08', 't02', 't05', 'b01', 't10'],
]
export function WardrobeBackground() {
  return (
    <div className="wardrobe-background" aria-hidden="true">
      {tracks.map((items, row) => (
        <div className={'wardrobe-row wardrobe-row-' + row} key={row}>
          <div className="wardrobe-track">
            {[0, 1].map((copy) => (
              <div className="wardrobe-group" key={copy}>
                {items.map((id, index) => (
                  <div className="wardrobe-tile" key={id + index}>
                    <img
                      src={'/assets/wardrobe/' + id + '.webp'}
                      alt=""
                      width="180"
                      height="225"
                      decoding="async"
                      fetchPriority="low"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
