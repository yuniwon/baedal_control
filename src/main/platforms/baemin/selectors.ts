export const baeminSelectors = {
  username: 'input[type="text"]',
  password: 'input[type="password"]',
  loginButton: 'button[type="submit"]',
  menuRow: 'tr[data-menu-id]',
  nameInput: '.name input',
  priceInput: '.price input',
  saveButton: 'button:has-text("저장")'
} as const
