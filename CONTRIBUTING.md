# Contributing Guide

Thank you for considering contributing to the SillyTavern Telegram Connector project! Below are some guidelines to help you get involved in the project's development.

## How to Contribute

### Reporting issues

If you find a bug or have a feature suggestion, please submit it via GitHub Issues:

1. Before submitting, search existing Issues first to avoid duplicates
2. Use a clear title to describe the issue
3. Describe the issue or suggestion in detail, providing as much as possible:
   - Reproduction steps
   - Expected behavior
   - Actual behavior
   - Error messages and logs
   - System/environment information

### Submitting code

1. Fork this repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Submit a Pull Request

### Pull Request guidelines

- Make sure the code follows the project's coding style
- Update documentation to reflect your changes
- Keep the PR focused on a single feature or fix
- Clearly explain in the PR description what your changes are and their purpose

## Development Setup

### Prerequisites

- Node.js 14.0 or higher
- A running SillyTavern instance

### Local development

1. Clone the repository:
   ```bash
   git clone https://github.com/qiqi20020612/SillyTavern-Telegram-Connector.git
   cd SillyTavern-Telegram-Connector
   ```

2. Set up the server:
   ```bash
   cd server
   npm install
   ```

3. Create a Telegram Bot:
   - Create a new Telegram Bot using [@BotFather](https://t.me/BotFather)
   - Get the Bot Token
   - Replace the TOKEN variable in `server.js`

4. Start the server:
   ```bash
   npm run dev
   ```

5. Install the extension into SillyTavern:
   - In SillyTavern, install the extension using a local file path
   - Or install via URL: `http://localhost:your-port/SillyTavern-Telegram-Connector`

## Coding Style

- Use meaningful variable and function names
- Add appropriate comments
- Follow JavaScript best practices

## License

By submitting a Pull Request, you agree that your contribution will be released under the [GPL-3.0 license](LICENSE).
