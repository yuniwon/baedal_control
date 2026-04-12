export const ddangyoSelectors = {
  username: 'input[name="mbrId"]',
  password: 'input[type="password"]',
  loginButton: 'button:has-text("로그인")',
  menuRow: 'tr[data-menu-id]',
  nameInput: '.menu-name input',
  priceInput: '.menu-price input',
  saveButton: 'button:has-text("저장")'
} as const
