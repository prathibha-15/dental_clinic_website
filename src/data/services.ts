export const categories = [
  { title: 'General Dentistry', icon: 'tooth', description: 'Care for everyday dental concerns and check-ups.', treatments: ['Dental consultation', 'Routine dental check-up', 'Oral examination', 'Toothache treatment', 'Dental emergency consultation'] },
  { title: 'Preventive Care', icon: 'sparkle', description: 'Routine care and guidance for your oral health.', treatments: ['Teeth scaling and cleaning', 'Teeth polishing', 'Dental sealants', 'Oral hygiene counselling'] },
  { title: 'Restorative Dentistry', icon: 'plus', description: 'Options for repairing teeth affected by damage or decay.', treatments: ['Tooth-coloured fillings', 'Dental cavity treatment', 'Broken tooth restoration', 'Dental bonding', 'Inlays and onlays'] },
  { title: 'Root Canal Treatment', icon: 'tooth', description: 'Treatment options for the inside of a tooth.', treatments: ['Root canal treatment', 'Re-root canal treatment', 'Pulp capping'] },
  { title: 'Tooth Replacement', icon: 'layers', description: 'Options to replace missing teeth or restore a tooth.', treatments: ['Dental crowns and caps', 'Bridges', 'Complete dentures', 'Partial dentures', 'Dental implants'] },
  { title: 'Orthodontics', icon: 'align', description: 'Options to help address teeth alignment.', treatments: ['Metal braces', 'Ceramic braces', 'Clear aligners', 'Retainers', 'Teeth alignment correction'] },
  { title: 'Additional available treatments', icon: 'sun', description: 'Options to discuss for the appearance of your teeth.', treatments: ['Teeth whitening', 'Dental veneers', 'Tooth reshaping', 'Gap closure'] },
  { title: 'Oral Surgery', icon: 'cross', description: 'Consultation and treatment options for tooth removal.', treatments: ['Simple tooth extraction', 'Wisdom tooth removal', 'Surgical extraction'] },
  { title: "Children's Dentistry", icon: 'heart', description: 'Dental check-ups for children.', treatments: ["Children's dental check-ups"] },
  { title: 'Diagnostics', icon: 'scan', description: 'Dental imaging to support assessment.', treatments: ['Dental X-rays'] },
] as const;
