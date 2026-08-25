import { RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN } from '../models/Receiver';

/** Free talk granted once when a new caller account is created. */
export const CALLER_WELCOME_FREE_TALK_MINUTES = 2;

export const CALLER_WELCOME_FREE_TALK_INR =
  CALLER_WELCOME_FREE_TALK_MINUTES * RECEIVER_AUDIO_CALL_RATE_INR_PER_MIN;
