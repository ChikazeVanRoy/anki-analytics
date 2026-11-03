// Interface language. English only for now; the structure lets a locale be chosen here later.
import { en, type Messages } from './en'

/** BCP 47 locale for number and date formatting. */
export const LOCALE = 'en-GB'

export const messages: Messages = en

export type { Messages }
