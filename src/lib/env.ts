const SECRET = process.env.AI_KEY_ENCRYPTION_SECRET;

if (!SECRET || SECRET.length < 32) {
  throw new Error(
    'AI_KEY_ENCRYPTION_SECRET is missing or too short (need ≥ 32 chars). ' +
    'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"'
  );
}

export const AI_KEY_SECRET = SECRET;
