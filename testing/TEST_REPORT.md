# ProxiSpeak – Test Report

**Tester:** Uma Acharya
**Date:** 2026-10-23
**Environment:** Windows, Chrome, client at http://localhost:5173
**Branch:** branch-Uma

## Summary
| Total | Passed | Failed | Pending |
|-------|--------|--------|---------|
| 2 | 0 | 0 | 2 |

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
- **Screenshot:** [View TC-01 Screenshot](screenshots/Screenshot%202026-10-23%20163937.png)
### TC-02: Host a New Spatial Meeting
- **Feature:** Meeting Management / Spatial Meeting
- **Description:** Verify that a logged-in user can create and host a new spatial meeting.
- **Steps Performed:**
  1. Open http://localhost:5173
  2. Sign in using valid credentials.
  3. Navigate to the dashboard.
  4. Click the "Host a Call" or "Create Meeting" option.
  5. Enter the required meeting details, if prompted.
  6. Submit the form to start the meeting.
  7. Verify whether the meeting room and joining details are displayed.
- **Expected Result:** A new spatial meeting is created successfully, and the meeting room or joining details are displayed.
- **Actual Result:** Pending execution.
- **Status:** PENDING
- **Bugs/Issues:** Not yet verified.
- **Screenshot:** [View TC-02 Screenshot](screenshots/Screenshot%202026-10-23%20170725.png)
## Bug List
| Bug ID | Test Case | Summary | Severity | Status |
|--------|-----------|---------|----------|--------|
| BUG-01 | TC-01 | Sign-in request returns HTTP 500 Internal Server Error | Medium (tentative) | Open - Investigation Required |
| BUG-02 | TC-02 | Meeting creation fails with Unexpected end of JSON input | Medium (tentative) | Open - Investigation Required |