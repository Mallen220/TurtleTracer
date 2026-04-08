# What's New in 2.1.1

This release focuses on workflow quality, browser experience, and export reliability, while laying major groundwork with backend improvements for Svelte 5.

## **Feature Additions & Workflow Enhancements**

Path building and editor customization are significantly more capable in this release.

- **Path Chaining Added:** Added a chaining feature so users can create connected path chains more efficiently.
- **Advanced Draw Tool Configs:** Added new settings in the Advanced tab for users who want deeper control over draw tool behavior.
- **Onion Skin Relocated:** Moved onion skin controls into the Interface section for better organization and discoverability.
- **Context Menus Show Keybinds:** Context menu entries now display their related keybinds for faster command learning.

## **Field Accuracy & Simulation Fidelity**

Field visuals and dimensions now better match real-world expectations and compatibility goals.

- **Corrected Field Image Scale:** Updated the field image to reflect the real 141.5x141.5 size.
- **Field Walls Included:** Added field walls to preserve 144x144 compatibility expectations.
- **Path Collision Optimization:** Optimized path collision checking for better responsiveness and more reliable validation.

## **Export, Codegen & Reliability Fixes**

Several fixes address code generation quality and reduce incorrect export artifacts.

- **Java Export Marker Fix:** Removed false event markers from basic Java exports.
- **Code Export Stability:** Fixed broken code exporting for certain feature combinations.
- **Edge Case Hardening:** Includes additional bug fixes for several edge cases.
- **General Reliability Polish:** Includes several broader bug fixes across core workflows.

## **Browser, UI & Platform Updates**

Browser users and daily interaction flows receive important quality-of-life improvements.

- **Google Analytics for Browser Users:** Added analytics support for browser deployments.
- **Less Intrusive Rating Dialog:** Reduced disruption from the rating dialog experience.
- **Dialog Open Lag Fix:** Fixed lag when opening dialogs on certain browsers.
- **Minor Browser Fixes:** Includes several smaller browser-specific fixes.

## **Developer & Architecture Updates**

This release also strengthens maintainability and long-term platform evolution.

- **Major Svelte 5 Backend Updates:** Completed substantial backend modernization work for Svelte 5.
- **New Developer Tests:** Added new developer-focused tests to improve confidence in future updates.
