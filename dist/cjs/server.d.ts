import { AuthenticationEncoded, AuthenticationParsed, CredentialKey, NamedAlgo, RegistrationEncoded, RegistrationParsed } from "./types.js";
interface RegistrationChecks {
    challenge: string | Function;
    origin: string | Function;
}
export declare function verifyRegistration(registrationRaw: RegistrationEncoded, expected: RegistrationChecks): Promise<RegistrationParsed>;
interface AuthenticationChecks {
    challenge: string | Function;
    origin: string | Function;
    userVerified: boolean;
    counter: number;
}
export declare function verifyAuthentication(authenticationRaw: AuthenticationEncoded, credential: CredentialKey, expected: AuthenticationChecks): Promise<AuthenticationParsed>;
type VerifyParams = {
    algorithm: NamedAlgo;
    publicKey: string;
    authenticatorData: string;
    clientData: string;
    signature: string;
};
export declare function verifySignature({ algorithm, publicKey, authenticatorData, clientData, signature }: VerifyParams): Promise<boolean>;
export {};
