# Security & Secret Management Guide

## 🔒 Overview

This guide explains how to safely manage secrets, API keys, and sensitive data in the kuya-comps project to prevent accidental exposure in version control.

## 🚨 Critical Rules

### ❌ NEVER commit these to Git:
- `.env` files with real credentials
- API keys or tokens
- Database passwords
- Private keys or certificates
- Access tokens
- Service account credentials
- Any file containing real secrets

### ✅ ALWAYS:
- Use environment variables for secrets
- Keep `.env` in `.gitignore`
- Use `.env.example` as a template (with placeholder values)
- Review changes before committing
- Let the pre-commit hook run

## 🛡️ Security Layers

### Layer 1: `.gitignore`

The [`.gitignore`](../.gitignore) file prevents sensitive files from being staged:

```bash
# Environment files
.env
.env.local
.env.production
.env.development
.env.*.local
.env.test.local
.env.staging

# Secret files
*.key
*.pem
*.p12
credentials.json
secrets.yml
```

**Note:** `.gitignore` only prevents NEW files from being tracked. If a file was previously committed, you must remove it from Git history.

### Layer 2: Pre-commit Hook

The pre-commit hook automatically scans staged changes for secrets using [gitleaks](https://github.com/gitleaks/gitleaks):

- **Location:** `.git/hooks/pre-commit`
- **Runs:** Automatically before every commit
- **Blocks:** Commits containing potential secrets
- **Config:** Uses [`.gitleaks.toml`](../.gitleaks.toml) for custom rules

#### What it detects:
- eBay API credentials (App ID, Dev ID, Cert ID)
- SearchAPI.io keys
- Redis URLs with passwords
- Sentry DSN strings
- High-entropy strings (likely secrets)
- Private key files
- Environment files

### Layer 3: Gitleaks Configuration

Custom rules in [`.gitleaks.toml`](../.gitleaks.toml) detect project-specific secrets:

```toml
[[rules]]
    id = "ebay-app-id"
    description = "eBay Application ID"
    regex = '''(?i)(ebay_app_id|ebay_dev_id|ebay_cert_id)\s*=\s*['"][a-zA-Z0-9\-]{10,}['"]'''
```

## 📋 Setting Up Your Environment

### First-Time Setup

1. **Copy the example environment file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` with your real credentials:**
   ```bash
   # Open in your editor
   nano .env  # or vim, code, etc.
   ```

3. **Never commit `.env`:**
   ```bash
   # This should show .env is ignored
   git status
   ```

4. **Verify gitleaks is installed:**
   ```bash
   # Install if needed
   brew install gitleaks  # macOS
   
   # Test it works
   gitleaks version
   ```

### Required Environment Variables

See [`.env.example`](../.env.example) for a complete list. The critical ones are:

```bash
# Required for active listings
EBAY_APP_ID=your_real_app_id
EBAY_DEV_ID=your_real_dev_id  
EBAY_CERT_ID=your_real_cert_id

# Required for sold listings
SEARCH_API_KEY=your_real_searchapi_key

# Required for caching
REDIS_URL=redis://localhost:6379
```

## 🔍 Testing the Security Setup

### Test the pre-commit hook:

```bash
# Try to commit a file with a fake secret
echo 'EBAY_APP_ID="ActualSecretKey123"' > test-secret.txt
git add test-secret.txt
git commit -m "test"

# Expected: ❌ Commit should be BLOCKED
# The hook will prevent this commit

# Clean up
rm test-secret.txt
```

### Scan existing files for secrets:

```bash
# Scan all files in the repo
gitleaks detect --config .gitleaks.toml --verbose

# Scan only uncommitted changes
gitleaks protect --staged --config .gitleaks.toml
```

## 🚑 What to Do If You Committed a Secret

### If the secret was committed but NOT pushed:

1. **Remove from the last commit:**
   ```bash
   # Undo the last commit, keeping changes
   git reset --soft HEAD~1
   
   # Remove the secret from the file
   # Edit the file to remove the secret
   
   # Stage and commit again
   git add .
   git commit -m "your message"
   ```

2. **Amend the last commit:**
   ```bash
   # Edit files to remove secrets
   
   # Amend the commit
   git add .
   git commit --amend --no-edit
   ```

### If the secret WAS pushed to GitHub:

🚨 **CRITICAL:** The secret is now public. Take immediate action:

1. **Rotate the secret IMMEDIATELY:**
   - eBay: Generate new API credentials in your eBay developer account
   - SearchAPI: Generate a new API key in your SearchAPI dashboard
   - Redis: Change the password
   - Any other compromised credentials

2. **Remove from Git history:**
   ```bash
   # Using BFG Repo Cleaner (recommended)
   # Download from: https://rtyley.github.io/bfg-repo-cleaner/
   
   # Remove file containing secrets
   java -jar bfg.jar --delete-files .env
   
   # Clean up
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive
   
   # Force push (DANGER: coordinate with team)
   git push --force
   ```

   **OR using git-filter-repo:**
   ```bash
   # Install: pip install git-filter-repo
   
   # Remove file from history
   git filter-repo --path .env --invert-paths
   
   # Force push
   git push --force
   ```

3. **Verify removal:**
   - Check GitHub commit history
   - Use GitHub's secret scanning alerts
   - Search for the secret in the repo

## 🔐 Best Practices

### For Developers

1. **Use .env files locally**
   - Keep all secrets in `.env`
   - Never hardcode secrets in code
   - Use `python-dotenv` to load environment variables

2. **Review before committing**
   ```bash
   # Always review what you're committing
   git diff --staged
   
   # Check for sensitive patterns
   git diff --staged | grep -i "api_key\|password\|secret"
   ```

3. **Use meaningful placeholder values in `.env.example`**
   ```bash
   # ❌ Bad
   EBAY_APP_ID=
   
   # ✅ Good
   EBAY_APP_ID=your_ebay_app_id_here
   ```

4. **Never bypass the pre-commit hook** (unless you're absolutely certain)
   ```bash
   # This disables security checks - avoid!
   git commit --no-verify
   ```

### For Production Deployments

1. **Use environment variables on hosting platforms:**
   - Railway: Set in project settings → Variables
   - Render: Set in project settings → Environment
   - Heroku: Use `heroku config:set`
   - Never commit production secrets

2. **Use secret management services for sensitive production data:**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Google Secret Manager
   - Azure Key Vault

3. **Rotate credentials regularly:**
   - Set a schedule (e.g., every 90 days)
   - Use different credentials for dev/staging/prod
   - Document the rotation process

4. **Enable monitoring:**
   - GitHub secret scanning
   - Sentry for error tracking (errors might leak secrets)
   - Regular security audits

## 📚 Additional Resources

- [Gitleaks Documentation](https://github.com/gitleaks/gitleaks)
- [GitHub Secret Scanning](https://docs.github.com/en/code-security/secret-scanning)
- [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- [eBay Developer Security](https://developer.ebay.com/api-docs/static/security.html)

## ❓ FAQ

### Q: Can I commit `.env.example`?
**A:** Yes! `.env.example` should be committed. It serves as a template with placeholder values, not real secrets.

### Q: What if gitleaks reports a false positive?
**A:** Update [`.gitleaks.toml`](../.gitleaks.toml) to add the pattern to the allowlist:
```toml
[allowlist]
    regexes = [
        '''your_false_positive_pattern'''
    ]
```

### Q: How do I bypass the pre-commit hook?
**A:** Use `git commit --no-verify` - but only if you're absolutely certain there are no secrets. This is dangerous!

### Q: What if I accidentally pushed API keys that are now rate-limited?
**A:** Rotate them immediately, even if you remove them from Git history. Once pushed, consider them compromised.

### Q: Should I encrypt my `.env` file?
**A:** No need - just keep it out of Git. For team sharing, use a password manager (1Password, LastPass) or secret management service.

## 🆘 Getting Help

If you've committed secrets or have security concerns:

1. **DO NOT** panic or try to hide it
2. **DO** rotate the compromised credentials immediately  
3. **DO** notify the team lead or security contact
4. **DO** document what happened and how you fixed it

Remember: Everyone makes mistakes. The important thing is to handle them quickly and learn from them.
