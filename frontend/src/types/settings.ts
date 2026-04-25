export interface SettingPut {
  key: string;
  value: string;
}

export interface SettingGetResponse {
  key: string;
  /** Masked to "***last4" for secret keys; plaintext for others. */
  value: string;
}
