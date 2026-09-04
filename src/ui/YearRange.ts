// A dual-thumb year-range slider built from two overlaid <input type=range>
// elements — the classic no-dependency trick: both share the same track,
// each shows only its thumb (pointer-events limited to the thumb itself),
// and a filled bar between them is drawn separately.
export function createYearRangeSlider(min: number, max: number, onChange: (from: number, to: number) => void) {
  if (min >= max) max = min + 1;

  const wrap = document.createElement('div');
  wrap.className = 'year-slider';
  wrap.innerHTML = `
    <div class="year-slider-labels"><span class="year-label-min"></span><span class="year-label-max"></span></div>
    <div class="year-slider-track"><div class="year-slider-range"></div></div>
  `;
  const track = wrap.querySelector('.year-slider-track')!;
  const fill = wrap.querySelector('.year-slider-range') as HTMLElement;
  const labelMin = wrap.querySelector('.year-label-min')!;
  const labelMax = wrap.querySelector('.year-label-max')!;

  const minInput = document.createElement('input');
  minInput.type = 'range';
  minInput.className = 'year-range year-range-min';
  minInput.min = String(min); minInput.max = String(max); minInput.value = String(min);
  minInput.setAttribute('aria-label', 'From year');

  const maxInput = document.createElement('input');
  maxInput.type = 'range';
  maxInput.className = 'year-range year-range-max';
  maxInput.min = String(min); maxInput.max = String(max); maxInput.value = String(max);
  maxInput.setAttribute('aria-label', 'To year');

  track.appendChild(minInput);
  track.appendChild(maxInput);

  function update() {
    const a = Number(minInput.value), b = Number(maxInput.value);
    const span = max - min || 1;
    fill.style.left = (((a - min) / span) * 100) + '%';
    fill.style.right = ((1 - (b - min) / span) * 100) + '%';
    labelMin.textContent = String(a);
    labelMax.textContent = String(b);
    onChange(a, b);
  }
  minInput.addEventListener('input', () => {
    if (Number(minInput.value) > Number(maxInput.value)) minInput.value = maxInput.value;
    update();
  });
  maxInput.addEventListener('input', () => {
    if (Number(maxInput.value) < Number(minInput.value)) maxInput.value = minInput.value;
    update();
  });
  update();
  return wrap;
}
