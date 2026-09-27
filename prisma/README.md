# Data model

Managers have accounts. Workers do not. A worker is a name plus an employee ID on a public link for one shift requirement.

```text
Organization
  ├── ManagerUser          (organizationId is null until onboarding)
  ├── Branch
  └── ShiftRequirement     (one cycle for one branch, owns linkToken)
        ├── AvailabilitySubmission   unique on (shiftRequirementId, employeeId)
        │     └── AvailabilityEntry  day + shift type + hour window
        └── ScheduleAssignment       name and employeeId copied at generation time
```

`AvailabilitySubmission` has no foreign key to `ManagerUser` or any other account table. Workers never sign up. Their identity is `workerName` plus `employeeId`, and that pair only has to be unique inside a single `ShiftRequirement`. Submitting again with the same employee ID replaces the previous submission. `ScheduleAssignment` stores a copy of that name and employee ID so a later edit to the submission does not change a schedule that was already generated.
