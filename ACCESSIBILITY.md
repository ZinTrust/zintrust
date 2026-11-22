# Accessibility

ZinTrust aims to make its framework, command-line tools, documentation, and project-maintained web interfaces usable by as many people as possible, including people with disabilities and people who use assistive technology.

This statement describes our goals, contributor guidance, known gaps, and how to report an accessibility barrier. It is not a claim that ZinTrust or any specific interface conforms to an accessibility standard.

## Scope

This statement applies to project-maintained:

- The `zin` CLI, including command output, help, errors, and interactive prompts.
- Documentation in this repository, the documentation site built from it, and README files in the repository, including package READMEs.
- Web interfaces shipped with ZinTrust, such as the queue monitor and worker-management interface.
- Website content maintained by the ZinTrust project.

The statement does not cover third-party services or content, nor applications built by framework users. We aim to avoid introducing barriers in starter templates and generated code, but those outputs are not comprehensively audited.

## Accessibility goals

- **Web content:** We use the Web Content Accessibility Guidelines (WCAG) 2.2 Level AA as a design and review target. We have not established or verified conformance, and automated checks alone would not establish it.
- **CLI output:** Color, symbols, and emoji should not be the only way to distinguish status or meaning. New and changed output should include clear text labels where needed.
- **CLI interaction:** Prompts should be usable with keyboard input and should have a non-interactive option, such as a flag or configuration value, where practical. Actual assistive-technology compatibility depends on the terminal, prompt library, and operating system.
- **Errors and guidance:** Messages should describe the problem in plain language and, when possible, give a useful next step.
- **Documentation:** Pages should have a logical heading structure, descriptive link text, meaningful image alternatives, and text explanations for diagrams or other visual-only information.

These are goals for ongoing work, not guarantees that every existing surface meets them.

## Contributor guidance

### CLI changes

- Do not communicate status with color, emoji, or symbols alone; include words such as “Error,” “Warning,” or “Success” where appropriate.
- Avoid unnecessary animation and repeated output. Do not start spinners or progress displays when output is not attached to an interactive terminal.
- Provide flags, configuration, or another non-interactive path for new prompts where practical.
- Keep error messages specific and include a next step when one is known.

### Documentation changes

- Keep headings in a logical hierarchy and do not skip heading levels.
- Use Markdown lists and tables with header rows.
- Use descriptive link text instead of phrases such as “click here.”
- Give informative images meaningful alternative text. Include a text explanation for diagrams and other visual-only material.
- Label code blocks with their language and use plain language; define acronyms when first introduced.

### Web interface changes

- Make controls operable by keyboard, provide visible focus, and avoid keyboard traps.
- Give controls accessible names and use appropriate native elements, roles, and states.
- Do not rely on color alone to convey information. Check text and control contrast against WCAG AA criteria.
- Ensure that dynamic updates and validation errors can be perceived by assistive technology.
- Before review, run an automated accessibility checker and perform a keyboard-only check. Automated results do not replace manual review; use a screen reader when one is available.

## Known gaps and limitations

We have not completed a comprehensive accessibility audit of the CLI, documentation site, or shipped web interfaces, and we do not currently publish an accessibility test report.

Source review identifies areas that need ongoing attention:

- Some CLI output uses ANSI color and symbols such as `[✓]` and `[!]`; status wording is not consistent everywhere.
- Interactive CLI prompts are provided by a prompt library, but keyboard and screen-reader behavior has not been systematically tested across terminals.
- Documentation includes tables and text-based diagrams that may be difficult to navigate or understand in some assistive technologies.
- Dynamic web interfaces, including queue and worker dashboards, have not been comprehensively evaluated for keyboard operation, accessible names, state announcements, focus behavior, or contrast.
- We do not publish a tested compatibility matrix for terminals, browsers, or screen readers. Behavior can vary by their versions and configuration.
- Third-party content and services are outside our control.

This list is not exhaustive. Please report barriers that are not listed here.

## Reporting an accessibility barrier

Open an issue in the [ZinTrust GitHub issue tracker](https://github.com/ZinTrust/zintrust/issues/new) and start the title with `[Accessibility]`. Issues are public. Include only information you are comfortable sharing publicly.

If possible, include:

- What you were trying to do and what happened.
- The command, documentation page, or URL involved.
- Steps to reproduce the barrier.
- The operating system, terminal or browser, and assistive technology involved, including versions if known.
- Relevant copied output or a screenshot after removing secrets and personal information. A recording is optional.

You do not need to share a diagnosis or other personal information. We do not currently publish a dedicated private channel for accessibility reports; community channels listed in the [README community and support section](https://github.com/ZinTrust/zintrust#community--support) may be public or operated by third parties. Do not assume they are confidential.

### Impact and prioritization

- **Critical:** A core task, such as installing ZinTrust, creating a project, or accessing essential documentation, cannot be completed.
- **Serious:** A task is significantly difficult, but a workaround exists.
- **Moderate:** The barrier causes repeated friction or inconsistency.
- **Minor:** The barrier has a small impact on usability.

We consider impact alongside other issues when prioritizing work. We do not currently publish response or fix-time commitments.

## Feedback

Accessibility is ongoing work. Feedback and pull requests that improve this statement or ZinTrust are welcome.
