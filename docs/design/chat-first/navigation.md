# Two-tier navigation concept

The first tier selects an app area. The second tier shows the projects, records, or integrations available inside it.
The work area opens a conversation or record. Its optional inspector shows the criteria, case, or evidence the user
is working on.

| First tier   | Second tier                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chats        | New chat, chat search, and collapsible project groups. Each project contains its conversations. Mark reviews, active work, and interrupted runs on their rows.       |
| Workspace    | Project picker and manual destinations grouped under Authoring, Execution, and Setup. Keep the same project when moving from a conversation to its cases or reports. |
| Integrations | Provider connections and project integrations, with their connection status and setup actions.                                                                       |
| Settings     | Pinned to the bottom of the first tier. Opens app preferences. Project-specific controls live in the workspace.                                                      |

The [navigation mock](navigation-mock.html) uses an icon-only rail. Labels appear on hover and keyboard focus.
Hairline borders separate the rail, the second pane, and the work area. The second pane keeps the Appraise logo
and the current area's actions in a sticky header while the list scrolls. In Chats, the header includes New chat,
search, and sort by latest update or title. On a narrower window, the rail opens and closes the second pane.

Desktop controls use rounded corners and compact padding. Touch controls have a 44 px target. The composer
puts the message field above a toolbar. Context and permissions sit on the left. Provider, model and reasoning
preferences, dictation, and Send or Stop sit on the right. These controls use sample state in the mock.
Deeper blue accents mark selection and primary actions. Amber marks review states against darker neutral surfaces.

In Chats, a criteria decision belongs beside the corresponding revision and environment. In Workspace, a selected case
opens in an inspector while the list keeps its filters and position. **Discuss in chat** returns the user to the
conversation with the case in context. These are design concepts for review.

Chromium verification covered hover and keyboard tooltips, sticky controls while scrolling, chat search and sorting,
section switching, and the narrow layout. Playwright CLI was used because the bundled Browser host was unavailable.
