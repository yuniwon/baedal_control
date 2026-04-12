export const coupangEatsSelectors = {
  username: 'input[name="email"]',
  password: 'input[name="password"]',
  loginButton: 'button[type="submit"]',
  menuRow: '.menu-row[data-menu-id]',
  nameInput: '.menu-name input',
  priceInput: '.menu-price input',
  saveButton: 'button:has-text("저장")'
} as const
