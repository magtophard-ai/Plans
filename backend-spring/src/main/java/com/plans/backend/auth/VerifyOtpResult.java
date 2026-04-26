package com.plans.backend.auth;

public enum VerifyOtpResult {
    OK,
    INVALID,
    EXPIRED,
    NOT_FOUND,
    LOCKED
}
