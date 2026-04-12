export const baeminSelectors = {
  username: 'input[name="id"]',
  password: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
  menuRow: 'tr[data-menu-id]',
  nameInput: '.name input',
  priceInput: '.price input',
  saveButton: 'button:has-text("저장")'
} as const
