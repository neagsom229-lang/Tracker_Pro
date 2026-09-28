# Security Policy & Incident Response: RSA Private Key Exposure

## Incident Overview
The file `rsa_private_key.txt` was previously committed to git history. Although it is now gitignored and slated for removal from the commit history, any clone of the repository prior to this purge may retain a copy of the key.

## Immediate Key Rotation Instructions
If `rsa_private_key.txt` was used for JWT signing, authentication, payment verification, or encryption with any external service or Supabase backend:

1. **Revoke the Exposed Key**: Immediately invalidate and delete the private key (`rsa_private_key.txt`) from all systems, environment variables, and certificate authorities.
2. **Generate a New Keypair**:
   ```bash
   # Generate a new 4048-bit RSA private key
   openssl genrsa -out rsa_private_key.txt 4096
   # Extract the public key if needed
   openssl rsa -in rsa_private_key.txt -pubout -out rsa_public_key.pem
   ```
3. **Update Services**:
   - Update any Supabase Edge Functions, backend services, or environment configurations relying on this private key with the newly generated key.
   - Update corresponding public keys on any validating services.
4. **Audit Logs**: Review access logs on systems that trusted the old key for any unauthorized activity during the exposure window.
