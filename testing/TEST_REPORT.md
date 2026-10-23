# ProxiSpeak – Test Report

**Tester:** Uma Acharya
**Date:** 2026-10-23
**Environment:** Windows, Chrome, client at http://localhost:5173
**Branch:** branch-Uma

## Summary
| Total | Passed | Failed | Pending |
|-------|--------|--------|---------|
| 1 | 0 | 0 | 1 |

## Test Cases

### TC-01: Sign in with username and password
- **Feature:** Authentication
- **Description:** Verify a registered user can sign in with username and password
- **Steps Performed:**
  1. Open http://localhost:5173
  2. Enter username and password on the Sign In tab
  3. Click Sign In
- **Expected Result:** User lands on the "Choose a Workspace or Host a Call" page
- **Actual Result:** Red banner "Server returned 500 (Internal Server Error)" (backend/.env not set up at this time)
- **Status:** PENDING (re-test after backend setup)
- **Bugs/Issues:** –

<!-- Copy this block for every new test case

### TC-XX: Title
- **Feature:**
- **Description:**
- **Steps Performed:**
  1.
  2.
- **Expected Result:**
- **Actual Result:**
- **Status:** PASS / FAIL
- **Bugs/Issues:** BUG-XX or –

(Only if FAIL, add these:)
- **Failure Brief:** what went wrong in 1-2 lines
- **Steps to Reproduce:**
  1.
  2.
- **Console/Network Error:** paste the exact error from DevTools
- **Screenshot:** screenshots/TC-XX-name.png
-->

## Bug List
| Bug ID | Test Case | Summary | Severity | Status |
|--------|-----------|---------|----------|--------|
| – | – | No confirmed bugs yet | – | – |