// Single source of truth for Srivari Seva fields.
// `type` = how the field behaves on the TTD page; the settings UI renders from the same list.
// `label` = default label text used to find the field on TTD (override in selectors.json → schemaOverrides).

export const INDIAN_STATES = ["Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal","Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu","Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry"];
export const BLOOD_GROUPS = ["A+","A-","B+","B-","AB+","AB-","O+","O-"];
export const LANGUAGES = ["Telugu","Tamil","Kannada","Hindi","English","Malayalam","Marathi","Odia","Bengali","Gujarati"];

const IDENTITY = [
  { key: "identity.idType", label: "ID Proof", type: "select", options: ["Aadhaar Card", "Passport"], required: true },
  { key: "identity.idNumber", label: "ID Number", type: "text", required: true, validate: "id" },
  { key: "identity.name", label: "Name", type: "text", required: true, validate: "name" },
  { key: "identity.surname", label: "Surname", type: "text", required: true },
  { key: "identity.fatherOrSpouse", label: "Father/Spouse Name", type: "text", required: true },
  { key: "identity.dob", label: "Date of Birth", type: "date", required: true, validate: "date" },
  { key: "identity.mobile", label: "Mobile", type: "text", required: true, validate: "mobile" },
  { key: "identity.email", label: "Email", type: "text", validate: "email" },
  { key: "identity.bloodGroup", label: "Blood Group", type: "select", options: BLOOD_GROUPS },
  { key: "identity.gender", label: "Gender", type: "select", options: ["Male", "Female", "Transgender"], required: true },
  { key: "identity.mentallyFit", label: "Mentally Fit", type: "checkbox" },
  { key: "identity.physicallyFit", label: "Physically Fit", type: "checkbox" }
];
const ADDRESS = [
  { key: "address.street", label: "Street", type: "text" },
  { key: "address.doorNo", label: "Door No", type: "text" },
  { key: "address.pincode", label: "Pincode", type: "text", validate: "pincode" },
  { key: "address.country", label: "Country", type: "select", options: ["India"], free: true },
  { key: "address.state", label: "State", type: "select", options: INDIAN_STATES, dependsOn: "address.country" },
  { key: "address.district", label: "District", type: "select", dependsOn: "address.state", hint: "Type exactly as shown on TTD" },
  { key: "address.city", label: "City", type: "text" },
  { key: "address.nearestTemple", label: "Nearest TTD Temple", type: "select", hint: "Type exactly as shown on TTD" }
];
const PHOTO = [{ key: "photo", label: "Photo", type: "file", accept: "image/jpeg,image/png", maxBytes: 1048576 }];

export const SEVA_SCHEMA = [
  { section: "Basic & Identity", fields: IDENTITY },
  { section: "Address", fields: ADDRESS },
  { section: "Photo", fields: PHOTO },
  { section: "Volunteer Details", fields: [
    { key: "volunteer.qualification", label: "Qualification", type: "text" },
    { key: "volunteer.profession", label: "Profession", type: "text" },
    { key: "volunteer.employeeId", label: "Employee ID", type: "text" },
    { key: "volunteer.designation", label: "Designation", type: "text" },
    { key: "volunteer.skill", label: "Specialisation/Skill", type: "text" },
    { key: "volunteer.placeOfWork", label: "Place of Working", type: "text" },
    { key: "volunteer.eduDoc", label: "Education Document", type: "file", accept: "image/jpeg,image/png", maxBytes: 1048576 }
  ]},
  { section: "Personal Details", fields: [
    { key: "personal.fullNameAadhaar", label: "Full Name (as per Aadhaar)", type: "text" },
    { key: "personal.fatherOrHusband", label: "Father's/Husband's Name", type: "text" },
    { key: "personal.maritalStatus", label: "Marital Status", type: "select", options: ["Single", "Married", "Widowed", "Divorced"] },
    { key: "personal.altMobile", label: "Alternate Mobile", type: "text", validate: "mobileOptional" },
    { key: "personal.residentialAddress", label: "Residential Address", type: "textarea" }
  ]},
  { section: "Education", fields: [
    { key: "education.category", label: "Qualification Category", type: "select", hint: "Type exactly as shown on TTD" },
    { key: "education.qualification", label: "Specific Qualification", type: "select", dependsOn: "education.category" },
    { key: "education.university", label: "University/College", type: "text" },
    { key: "education.year", label: "Year of Graduation", type: "text" },
    { key: "education.specialization", label: "Specialization", type: "text" }
  ]},
  { section: "Profession", fields: [
    { key: "profession.status", label: "Employment Status", type: "select", options: ["Employed", "Self Employed", "Retired", "Student", "Homemaker", "Unemployed"] },
    { key: "profession.sector", label: "Sector", type: "select", hint: "Type exactly as shown on TTD" },
    { key: "profession.category", label: "Profession Category", type: "select", hint: "Type exactly as shown on TTD" },
    { key: "profession.role", label: "Role", type: "select", dependsOn: "profession.category" },
    { key: "profession.years", label: "Years of Experience", type: "text" }
  ]},
  { section: "Experience & References", fields: [
    { key: "experience.volunteeredBefore", label: "Previously Volunteered", type: "radio", options: ["Yes", "No"] },
    { key: "experience.times", label: "Number of times", type: "text", showIf: { key: "experience.volunteeredBefore", equals: "Yes" } },
    { key: "experience.lastPeriods", label: "Last 2 seva periods", type: "text", showIf: { key: "experience.volunteeredBefore", equals: "Yes" } },
    { key: "experience.otherOrg", label: "Other Organisation", type: "text", showIf: { key: "experience.volunteeredBefore", equals: "Yes" } },
    { key: "experience.details", label: "Experience", type: "textarea", showIf: { key: "experience.volunteeredBefore", equals: "Yes" } },
    { key: "experience.languages", label: "Languages Known", type: "multi", options: LANGUAGES },
    { key: "experience.ref1Name", label: "Reference 1 Name", type: "text" },
    { key: "experience.ref1Mobile", label: "Reference 1 Mobile", type: "text", validate: "mobileOptional" },
    { key: "experience.ref2Name", label: "Reference 2 Name", type: "text" },
    { key: "experience.ref2Mobile", label: "Reference 2 Mobile", type: "text", validate: "mobileOptional" }
  ]}
];

export const GROUP_MEMBER_SCHEMA = [
  { section: "Basic & Identity", fields: IDENTITY },
  { section: "Address", fields: ADDRESS },
  { section: "Photo", fields: PHOTO }
];

export const SCHEMAS = { seva: SEVA_SCHEMA, groupMember: GROUP_MEMBER_SCHEMA };
export function flatFields(schema) { return schema.flatMap(s => s.fields); }
export function getPath(obj, path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setPath(obj, path, value) {
  const parts = path.split("."); let o = obj;
  for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] ??= {}; o = o[parts[i]]; }
  o[parts.at(-1)] = value;
}
