<!-- Read CONTRIBUTING.md first. One thing per pull request, opened against `main`. -->

## What and why

<!-- What changes for someone using the map, and what was wrong or missing before. Link the issue if there is one. -->

## Checked

<!-- The commands you ran, and the system you tried it on. Say also what you did not check. -->

- [ ] `cd vscode-extension && npm ci && npm run compile` passes
- [ ] No hook changes an input, a result, a prompt or a permission decision
- [ ] No label holds content: no command line, query, file text or full path
- [ ] No network request, file read or process beyond what the extension already does
- [ ] A new setting's default keeps today's behaviour
- [ ] For a change to how the map looks: a picture is attached

<!-- If the extension now reads or keeps something it did not before, say what. -->
