# Organization and repository picker

The project picker starts with a segmented organization control: My-Clone-AI,
bitcoinuniverseio, Project-Boden, and Echelon-RSVP. The active segment scopes
remote repository results. It is keyboard accessible, exposes the selected
state, and retains selected repositories when the organization changes.

Show a searchable remote repository list directly below the organization
control. Begin remote search at two trimmed characters; before then, prompt the
user to enter at least two characters. Each result is a toggle with a visible
selected state. Multiple repositories may be selected. Show selected
repositories as removable chips, including their organization, in selection
order; the first is the primary repository. Removing a chip also clears its
list selection. Keep the picker open while toggling results.

Keep a paste Git URL row visible independently of search. Place local folder
listing and Browse folders inside an **Advanced** disclosure for non-admin
coding sessions. Expanding it reveals available local choices and preserves
existing access restrictions.

Show distinct states for: waiting for the minimum query length; loading;
no matching repositories; missing GitHub access; and a search error with a
retry action. Keep existing selected chips visible in each state. Label the
search field, organization control, selection toggles, and chip removal
buttons for assistive technology; announce loading and errors without moving
focus. On narrow screens allow segments and chips to wrap without clipping.
