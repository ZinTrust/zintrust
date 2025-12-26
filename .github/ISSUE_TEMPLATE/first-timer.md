name: 🚀 First Timer Issue
description: An issue specifically designed for new contributors to get started.
labels: ["good-first-issue", "first-timer"]
body:

- type: markdown
  attributes:
  value: | ### Welcome, First Timer! 👋
  Thank you for wanting to contribute to Zintrust. This issue is designed to be a great starting point for your first contribution.

      **Before you start:**
      1. Read our [Contributor Guide](https://github.com/ZinTrust/ZinTrust/blob/master/docs/contributing.md).
      2. Comment below to let us know you're working on this.
      3. Join our [Discord/Community] if you need help!

- type: textarea
  id: description
  attributes:
  label: Issue Description
  description: Describe the task clearly.
  placeholder: e.g., Add a new utility function for date formatting...
  validations:
  required: true

- type: textarea
  id: steps
  attributes:
  label: Steps to Complete
  description: Provide a step-by-step guide for the contributor.
  placeholder: | 1. Locate the file at `src/utils/...` 2. Implement the function `formatDate`... 3. Add a test case in `tests/utils/...` 4. Run `zin qa` to verify.
  validations:
  required: true

- type: markdown
  attributes:
  value: | ### Need Help?
  If you get stuck, feel free to ask questions in the comments! We're here to help you succeed.
