export interface PendingEnrollment {
  embedding: string;
  timestamp: number;
  originalText?: string;
}

export const pendingVoiceEnrollments = new Map<number | string, PendingEnrollment>();
