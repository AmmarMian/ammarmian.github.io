export function createSearchInput(placeholder: string, onQuery: (query: string) => void) {
  const wrap = document.createElement('div');
  wrap.className = 'search-box';
  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = placeholder;
  input.setAttribute('aria-label', placeholder);
  wrap.appendChild(input);

  let timer: number | undefined;
  input.addEventListener('input', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => onQuery(input.value), 120);
  });

  return wrap;
}
