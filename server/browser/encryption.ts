import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getEncryptionKey(): Buffer {
    const envKey = process.env.JARVIS_ENCRYPTION_KEY;
    if (envKey && envKey.length >= 32) {
        return Buffer.from(envKey.slice(0, 32), 'utf-8');
    }
    // Deterministic fallback for local dev (NOT for production)
    return crypto.createHash('sha256').update('jarvis-local-dev-key').digest();
}

export function encryptData(data: any): string {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const plaintext = JSON.stringify(data);
    let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
    encrypted += cipher.final('hex');
    // Prefix with iv so we can decrypt later
    return iv.toString('hex') + ':' + encrypted;
}

export function decryptData(cipherText: string): any {
    try {
        const key = getEncryptionKey();
        const [ivHex, encrypted] = cipherText.split(':');
        if (!ivHex || !encrypted) throw new Error('Invalid cipher format');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf-8');
        decrypted += decipher.final('utf-8');
        return JSON.parse(decrypted);
    } catch {
        // Backward compat: if decryption fails, data might be unencrypted
        return null;
    }
}

export function isEncrypted(value: string): boolean {
    // Encrypted format: 32-char hex IV + ':' + hex ciphertext
    return typeof value === 'string' && /^[a-f0-9]{32}:[a-f0-9]+$/.test(value);
}
