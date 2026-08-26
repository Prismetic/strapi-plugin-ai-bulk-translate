import type { Core } from '@strapi/strapi';

/**
 * Wraps Strapi's admin encryption service so the rest of the plugin never touches raw keys.
 *
 * The service derives its AES-256-GCM key from `admin.secrets.encryptionKey` on the host project.
 * Length does not matter — it is SHA-256 hashed — but absence does: `encrypt()` returns null, and
 * storing that would silently persist unencrypted-but-lost credentials. So the plugin checks at
 * startup and refuses to accept credentials rather than pretending it worked.
 */
const cryptoService = ({ strapi }: { strapi: Core.Strapi }) => {
  const encryption = () => strapi.service('admin::encryption') as {
    encrypt: (value: string) => string | null;
    decrypt: (value: string) => string | null;
  };

  return {
    isAvailable(): boolean {
      return Boolean(strapi.config.get('admin.secrets.encryptionKey'));
    },

    /** Throws rather than returning null, so a caller cannot store a failed encryption. */
    encrypt(value: string): string {
      const cipher = encryption().encrypt(value);

      if (cipher === null) {
        throw new Error(
          'Cannot encrypt: no admin encryption key configured on this Strapi project. ' +
            'Set ENCRYPTION_KEY and wire it through config/admin as secrets.encryptionKey.'
        );
      }

      return cipher;
    },

    /** Returns null when the stored value cannot be read — usually a rotated key. */
    decrypt(cipher: string): string | null {
      try {
        return encryption().decrypt(cipher);
      } catch {
        return null;
      }
    },

    /** `sk-proj-…9f2a`. Enough to recognise a key, useless to anyone who steals it. */
    mask(cipher: string | null): string | null {
      if (!cipher) {
        return null;
      }

      const plain = this.decrypt(cipher);

      if (!plain) {
        return '••••(unreadable — encryption key may have changed)';
      }

      return plain.length <= 8 ? '••••' : `${plain.slice(0, 3)}••••${plain.slice(-4)}`;
    },
  };
};

export default cryptoService;
