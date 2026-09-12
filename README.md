# NMDR portal and staff directory

Unzip this into the folder that holds the portal and let it overwrite what is
there. Everything below sits side by side, in one flat folder, no subfolders.

## The files that changed

| File | What it is |
| --- | --- |
| `index.html` | The portal. Directorate menu, install page, one password sign in, Access button. |
| `access.html` | The staff directory. Registration, dashboard, per person access, forgotten password. |
| `sw.js` | Service worker. The all or nothing update lives here, and access.csv is never served stale. |
| `nmdr-offline.js` | Install and Update behaviour, and the fully updated message. |

## The files that did not change

`manifest.json`, `offline.html`, `icon-192.png`, `icon-512.png`,
`icon-192-maskable.png`, `icon-512-maskable.png`, `apple-touch-icon.png`,
`favicon-32.png`, `ICF-SL.jpg`. Included only so the folder is complete. They
are byte for byte what was already there.

## Not in this zip, and still needed

* `mohlogo.png`, which the portal and the sign in card show.
* Every tool page the portal opens: `data_extraction.html`, `dqa.html`,
  `snt.html`, `automation.html`, `mocm_phu.html` and the rest. None of them
  were touched, so keep the copies in the folder.
* `access.csv`, optional. The Access button in the staff directory writes it.
  The portal only falls back to it when the sheet and the Apps Script cannot be
  reached.

## StaffDirectory.gs

This one is not a file for the folder. Open the Staff Database sheet,
Extensions then Apps Script, replace the code with it, then Deploy, Manage
deployments, edit the live deployment and set Version to New version. The URL
stays the same. The first run asks permission to send email as you, because
the forgotten password feature mails the password out. Accept it, or that
button will fail. Then run `setUpSheet` once from the editor: it repairs the
heading row and logs which column each heading landed in.

## The passwords

* `admin123` signs in to the portal and opens every tab. It also unlocks the
  Access button on each card in the staff directory.
* `Mohamed@1995` is asked for before a staff record can be removed.
* Each staff member's own password is the one they create on the registration
  form. It opens only the tabs ticked for them.

Every one of these sits in a single named constant near the top of the script
in its file, `GENERAL_PASSWORD`, `ACCESS_PASSWORD` and `REMOVE_PASSWORD`, so
changing one is a one line edit.

## Two things to know

The Password column in the sheet is empty for the records already saved, so
only `admin123` gets anyone in until each person is saved again with a password,
or the column is filled by hand. The same goes for the new Email column, which
the forgotten password button needs.

Passwords travel and are stored in plain text, in the sheet, in access.csv and
in the email that the forgotten password button sends. Anyone who can open the
sheet or that mailbox can read them. Hashing them, or checking them server side
instead, is the fix when you want it.

## Hosting

Installing the app and the offline layer both need https, so GitHub Pages or
DHIS2 is fine. Opening `index.html` straight from the disk will never offer to
install, and the service worker will not register.
