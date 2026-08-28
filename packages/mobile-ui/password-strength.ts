import { PASSWORD_MIN_LENGTH } from "@nnact/shared";

export type PasswordRequirement = {
  id: string;
  label: string;
  met: boolean;
};

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Too short" | "Weak" | "Fair" | "Good" | "Strong";
  requirements: PasswordRequirement[];
  isValid: boolean;
};

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "letter",
      label: "At least one letter",
      met: /[a-zA-Z]/.test(password),
    },
    {
      id: "number",
      label: "At least one number",
      met: /[0-9]/.test(password),
    },
  ];
}

export function getPasswordStrength(password: string): PasswordStrength {
  const requirements = getPasswordRequirements(password);
  const metCount = requirements.filter((item) => item.met).length;

  if (!password.length) {
    return { score: 0, label: "Too short", requirements, isValid: false };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return { score: 1, label: "Too short", requirements, isValid: false };
  }

  if (metCount === 1) {
    return { score: 1, label: "Weak", requirements, isValid: false };
  }

  if (metCount === 2) {
    return { score: 2, label: "Fair", requirements, isValid: false };
  }

  if (metCount === 3) {
    return { score: 4, label: "Strong", requirements, isValid: true };
  }

  return { score: 2, label: "Fair", requirements, isValid: false };
}
