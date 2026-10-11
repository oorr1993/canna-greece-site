# Composio CLI Setup Guide

This document provides instructions for setting up Composio CLI for the Canna Greece site project.

## Installation Methods

### Method 1: Using Curl (Recommended)
```bash
curl -fsSL https://composio.dev/install | bash
```

If you encounter network/proxy issues, continue to Method 2.

### Method 2: Using Python/Pip
First, ensure you have Python 3.8+ installed:

```bash
pip install composio
```

If this fails with dependency issues, try installing with specific versions:

```bash
pip install --upgrade pip setuptools wheel
pip install composio
```

### Method 3: Using npm (Node.js)
If you have Node.js installed:

```bash
npm install -g @composio/sdk
```

## Login to Composio

After successful installation, log in to your Composio account:

```bash
composio login
```

This will open a browser window to authenticate with your Composio account. Follow the on-screen prompts to complete the login process.

## Verification

To verify the installation was successful, run:

```bash
composio --version
```

You should see the version number output if Composio is properly installed.

## Troubleshooting

### Network/Proxy Issues
If you encounter 403 errors during installation:
1. Check your firewall/proxy settings
2. Try using a VPN if available
3. Contact your network administrator for access to `https://composio.dev`

### Python Dependency Issues
If pip installation fails with pysher or other dependency errors:
1. Update pip: `pip install --upgrade pip`
2. Try installing in a virtual environment: 
   ```bash
   python -m venv composio_env
   source composio_env/bin/activate  # On Windows: composio_env\Scripts\activate
   pip install composio
   ```

### Help
For more information and support, visit:
- Official Documentation: https://docs.composio.dev
- GitHub Repository: https://github.com/ComposioHQ/composio
- Community Discord: https://discord.gg/composio
