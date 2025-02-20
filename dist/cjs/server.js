"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignature = exports.verifyAuthentication = exports.verifyRegistration = void 0;
const parsers_js_1 = require("./parsers.js");
const utils = __importStar(require("./utils.js"));
async function isValid(validator, value) {
    if (typeof validator === 'function') {
        const res = validator(value);
        if (res instanceof Promise)
            return await res;
        else
            return res;
    }
    // the validator can be a single value too
    return validator === value;
}
async function isNotValid(validator, value) {
    return !(await isValid(validator, value));
}
async function verifyRegistration(registrationRaw, expected) {
    const registration = (0, parsers_js_1.parseRegistration)(registrationRaw);
    registration.client.challenge;
    if (registration.client.type !== "webauthn.create")
        throw new Error(`Unexpected ClientData type: ${registration.client.type}`);
    if (await isNotValid(expected.origin, registration.client.origin))
        throw new Error(`Unexpected ClientData origin: ${registration.client.origin}`);
    if (await isNotValid(expected.challenge, registration.client.challenge))
        throw new Error(`Unexpected ClientData challenge: ${registration.client.challenge}`);
    return registration;
}
exports.verifyRegistration = verifyRegistration;
async function verifyAuthentication(authenticationRaw, credential, expected) {
    if (authenticationRaw.credentialId !== credential.id)
        throw new Error(`Credential ID mismatch: ${authenticationRaw.credentialId} vs ${credential.id}`);
    const isValidSignature = await verifySignature({
        algorithm: credential.algorithm,
        publicKey: credential.publicKey,
        authenticatorData: authenticationRaw.authenticatorData,
        clientData: authenticationRaw.clientData,
        signature: authenticationRaw.signature
    });
    if (!isValidSignature)
        throw new Error(`Invalid signature: ${authenticationRaw.signature}`);
    const authentication = (0, parsers_js_1.parseAuthentication)(authenticationRaw);
    if (authentication.client.type !== "webauthn.get")
        throw new Error(`Unexpected clientData type: ${authentication.client.type}`);
    if (await isNotValid(expected.origin, authentication.client.origin))
        throw new Error(`Unexpected ClientData origin: ${authentication.client.origin}`);
    if (await isNotValid(expected.challenge, authentication.client.challenge))
        throw new Error(`Unexpected ClientData challenge: ${authentication.client.challenge}`);
    // this only works because we consider `rp.origin` and `rp.id` to be the same during authentication/registration
    const rpId = new URL(authentication.client.origin).hostname;
    const expectedRpIdHash = utils.toBase64url(await utils.sha256(utils.toBuffer(rpId)));
    if (authentication.authenticator.rpIdHash !== expectedRpIdHash)
        throw new Error(`Unexpected RpIdHash: ${authentication.authenticator.rpIdHash} vs ${expectedRpIdHash}`);
    if (!authentication.authenticator.flags.userPresent)
        throw new Error(`Unexpected authenticator flags: missing userPresent`);
    if (!authentication.authenticator.flags.userVerified && expected.userVerified)
        throw new Error(`Unexpected authenticator flags: missing userVerified`);
    if (authentication.authenticator.counter <= expected.counter)
        throw new Error(`Unexpected authenticator counter: ${authentication.authenticator.counter} (should be > ${expected.counter})`);
    return authentication;
}
exports.verifyAuthentication = verifyAuthentication;
// https://w3c.github.io/webauthn/#sctn-public-key-easy
// https://www.iana.org/assignments/cose/cose.xhtml#algorithms
/*
User agents MUST be able to return a non-null value for getPublicKey() when the credential public key has a COSEAlgorithmIdentifier value of:

-7 (ES256), where kty is 2 (with uncompressed points) and crv is 1 (P-256).

-257 (RS256).

-8 (EdDSA), where crv is 6 (Ed25519).
*/
function getAlgoParams(algorithm) {
    switch (algorithm) {
        case 'RS256':
            return {
                name: 'RSASSA-PKCS1-v1_5',
                hash: 'SHA-256'
            };
        case 'ES256':
            return {
                name: 'ECDSA',
                namedCurve: 'P-256',
                hash: 'SHA-256',
            };
        // case 'EdDSA': Not supported by browsers
        default:
            throw new Error(`Unknown or unsupported crypto algorithm: ${algorithm}. Only 'RS256' and 'ES256' are supported.`);
    }
}
async function parseCryptoKey(algoParams, publicKey) {
    const buffer = utils.parseBase64url(publicKey);
    return crypto.subtle.importKey('spki', buffer, algoParams, false, ['verify']);
}
// https://w3c.github.io/webauthn/#sctn-verifying-assertion
// https://w3c.github.io/webauthn/#sctn-signature-attestation-types
/* Emphasis mine:

6.5.6. Signature Formats for Packed Attestation, FIDO U2F Attestation, and **Assertion Signatures**

[...] For COSEAlgorithmIdentifier -7 (ES256) [...] the sig value MUST be encoded as an ASN.1 [...]
[...] For COSEAlgorithmIdentifier -257 (RS256) [...] The signature is not ASN.1 wrapped.
[...] For COSEAlgorithmIdentifier -37 (PS256) [...] The signature is not ASN.1 wrapped.
*/
// see also https://gist.github.com/philholden/50120652bfe0498958fd5926694ba354
async function verifySignature({ algorithm, publicKey, authenticatorData, clientData, signature }) {
    const algoParams = getAlgoParams(algorithm);
    let cryptoKey = await parseCryptoKey(algoParams, publicKey);
    console.debug(cryptoKey);
    let clientHash = await utils.sha256(utils.parseBase64url(clientData));
    // during "login", the authenticatorData is exactly 37 bytes
    let comboBuffer = utils.concatenateBuffers(utils.parseBase64url(authenticatorData), clientHash);
    console.debug('Crypto Algo: ' + JSON.stringify(algoParams));
    console.debug('Public key: ' + publicKey);
    console.debug('Data: ' + utils.toBase64url(comboBuffer));
    console.debug('Signature: ' + signature);
    // https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify
    let signatureBuffer = utils.parseBase64url(signature);
    if (algorithm == 'ES256')
        signatureBuffer = convertASN1toRaw(signatureBuffer);
    const isValid = await crypto.subtle.verify(algoParams, cryptoKey, signatureBuffer, comboBuffer);
    return isValid;
}
exports.verifySignature = verifySignature;
function convertASN1toRaw(signatureBuffer) {
    // Convert signature from ASN.1 sequence to "raw" format
    const usignature = new Uint8Array(signatureBuffer);
    const rStart = usignature[4] === 0 ? 5 : 4;
    const rEnd = rStart + 32;
    const sStart = usignature[rEnd + 2] === 0 ? rEnd + 3 : rEnd + 2;
    const r = usignature.slice(rStart, rEnd);
    const s = usignature.slice(sStart);
    return new Uint8Array([...r, ...s]);
}
