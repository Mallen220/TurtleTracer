# Event Markers

Event markers allow you to trigger robot actions at precise moments during your autonomous routine. Whether you need to deploy an intake while driving, fire a mechanism while waiting, or spin up a flywheel while rotating, markers provide the synchronization you need.

## **Marker Types**

There are three types of event markers, automatically determined by where they are placed in your sequence:

- **Path Markers:** Triggered at a specific percentage along a driving path.
  - **Visual:** Purple dots <span style="color:#a78bfa">●</span> on the path line.
- **Wait Markers:** Triggered at a specific percentage of a wait command's duration.
  - **Visual:** Purple circles with a **flag icon** ⚑ at the wait location.
- **Rotation Markers:** Triggered at a specific percentage of a rotation's completion.
  - **Visual:** Cyan circles with a **curved arrow icon** ↻ at the rotation location.

## **Managing Markers**

All markers are managed in the **Event Markers** panel in the control tab under the `Field` tab.

1.  **Add a Marker:** Click the purple **+ Add** button in the panel header. This adds a new marker to the end of your sequence.
2.  **Name It:** Give your marker a descriptive name (e.g., `"IntakeDeploy"`, `"Shoot"`). This name is used in your exported code to identify the event.
3.  **Position It:** Use the slider or number input to set the marker's **Global Position**.

## **Understanding Global Position**

The "Global Position" value represents exactly where the marker falls in your entire sequence.

- **The Whole Number (e.g., 1.xx):** Represents the **Step Index**.
  - `0.xx` is the **1st step**.
  - `1.xx` is the **2nd step**.
  - `2.xx` is the **3rd step**.
- **The Decimal (e.g., x.50):** Represents the **% Completion** of that step.
  - `.00` is the start (0%).
  - `.50` is the middle (50%).
  - `.99` is the end (99%).

> **Tip:** You can drag the slider to seamlessly move a marker from one step to another (e.g., sliding it from a Path directly into the following Wait).

## **In Your Code**

When you export your autonomous routine, event markers are generated as callbacks or command triggers based on the **Name** you assigned. Ensure your robot code handles these named events to perform the desired actions.
