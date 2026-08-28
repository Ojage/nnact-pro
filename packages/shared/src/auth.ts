export const AUTH_AUDIENCES = {
  staff: "staff",
  customer: "customer",
} as const;

export type AuthAudience = (typeof AUTH_AUDIENCES)[keyof typeof AUTH_AUDIENCES];

export interface StaffSessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId: string;
  mustChangePassword?: boolean;
}

export interface CustomerSessionUser {
  id: string;
  name: string;
  email: string;
}

export interface CustomerOrgLinkDTO {
  orgId: string;
  orgName: string;
  customerId: string;
  linkedVia: string;
}

export interface AuthTokenPairDTO {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface StaffAuthResponseDTO extends AuthTokenPairDTO {
  user: StaffSessionUser;
  mustChangePassword?: boolean;
}

export interface CustomerAuthResponseDTO extends AuthTokenPairDTO {
  user: CustomerSessionUser;
  orgs: CustomerOrgLinkDTO[];
}

export const PASSWORD_MIN_LENGTH = 12;

export function validatePasswordStrength(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one letter and one number.";
  }
  return null;
}
