# The personal media shelf

The owner built three physical collections on the portfolio homepage:
ten favourite albums, films, and games, identified by their printed spines.
A selection pulls a case into a hands-on display beside the wooden board.
The colours, artist/title logos, cartridge details, and PNG cases give it
personality; the lazy WebGL renderer adds opening, turning, and depth.

What already works:
- Curated rankings and original destination links are separate from artwork.
- Each format has its own recognisable material and silhouette.
- WebGL loads nearby, uses a panel-sized input surface, and pauses off-screen.
- Flat artwork and typographic cases keep the collection usable without WebGL.

What was awkward, and the changes:
- Hover and selection shared a barely visible lift. Spines now tip on hover,
  pull further out on selection, and expose a dark slot behind them.
- Music targets were 16 px wide. Fixed 24 px buttons surround the original
  16 px artwork; all ten remain accessible without overlapping hit areas.
- Every spine was a tab stop and its button role was overwritten. Each shelf
  now has a proper list, one roving tab stop, arrow/Home/End navigation,
  Enter-to-inspect, Space-to-select, and Escape-to-return.
- A quiet browse hint names hovered/focused items before selection.
- Explicit previous/next buttons and a counter sit beside the case controls.
  Quick horizontal touch swipes browse; slower drags still turn the case.
- Rank, full wrapping titles, creator/year, and the original action link form
  one info strip. Text changes fade in without waiting for artwork downloads.
- Front/Back appears only after the optional engine callback reports a face.
- Shared spacing keeps labels, boards, and details aligned; narrow screens
  stack each case under its spines without horizontal page overflow.
- Only visible cases animate; hidden tabs pause too. Reduced-motion disables
  decorative movement and is passed through to the 3-D engine.

The renderer, artwork manifests, public assets, and curated data stay external.
