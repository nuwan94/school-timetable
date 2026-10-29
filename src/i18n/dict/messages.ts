import type { Dict } from '../dicts';

/** Errors and confirmations: opening files, pasting, deleting. */
export default {
  'This is not a timetable project file.': ['මෙය කාලසටහන් ව්‍යාපෘති ගොනුවක් නොවේ.', 'இது நேர அட்டவணைத் திட்டக் கோப்பு அல்ல.'],
  'The project file has an invalid version number.': ['ව්‍යාපෘති ගොනුවේ අනුවාද අංකය වලංගු නැත.', 'திட்டக் கோப்பின் பதிப்பு எண் செல்லாது.'],
  'This file was saved by a newer version of the app (file v{file}, app v{app}). Please update the app.': [
    'මෙම ගොනුව සුරැකුණේ යෙදුමේ නවතම අනුවාදයකිනි (ගොනුව v{file}, යෙදුම v{app}). කරුණාකර යෙදුම යාවත්කාලීන කරන්න.',
    'இந்தக் கோப்பு செயலியின் புதிய பதிப்பில் சேமிக்கப்பட்டது (கோப்பு v{file}, செயலி v{app}). செயலியைப் புதுப்பியுங்கள்.',
  ],
  'No upgrade path from file version {version}.': ['ගොනු අනුවාදය {version} සිට යාවත්කාලීන කිරීමට මගක් නැත.', 'கோப்புப் பதிப்பு {version} இலிருந்து மேம்படுத்த வழி இல்லை.'],
  'The project file is damaged or incomplete.': ['ව්‍යාපෘති ගොනුව හානි වී හෝ අසම්පූර්ණයි.', 'திட்டக் கோப்பு சேதமடைந்துள்ளது அல்லது முழுமையற்றது.'],
  'This is not a template file (not valid JSON).': ['මෙය ආකෘති ගොනුවක් නොවේ (වලංගු JSON නොවේ).', 'இது வார்ப்புருக் கோப்பு அல்ல (செல்லுபடியான JSON அல்ல).'],
  'This is not a valid timetable template file.': ['මෙය වලංගු කාලසටහන් ආකෘති ගොනුවක් නොවේ.', 'இது செல்லுபடியான நேர அட்டவணை வார்ப்புருக் கோப்பு அல்ல.'],

  '{n} grade(s) and their classes': ['ශ්‍රේණි {n} සහ ඒවායේ පන්ති', '{n} தரம்(கள்) மற்றும் அவற்றின் வகுப்புகள்'],
  '{n} class(es)': ['පන්ති {n}', '{n} வகுப்பு(கள்)'],
  '{n} allocation(s)': ['විෂය බෙදීම් {n}', '{n} ஒதுக்கீடு(கள்)'],
  '{n} option block(s) lose this class': ['විකල්ප කාණ්ඩ {n}කට මෙම පන්තිය අහිමි වේ', '{n} தெரிவுத் தொகுதி(கள்) இந்த வகுப்பை இழக்கும்'],
  '{n} option-block group(s)': ['විකල්ප කාණ්ඩ කණ්ඩායම් {n}', '{n} தெரிவுத் தொகுதிக் குழு(க்கள்)'],
  '{n} allocation(s) become uncovered': ['විෂය බෙදීම් {n}කට ගුරුවරයෙකු නැති වේ', '{n} ஒதுக்கீடு(கள்) ஆசிரியர் இன்றி ஆகும்'],
  '{n} option-block group(s) lose their teacher': ['විකල්ප කාණ්ඩ කණ්ඩායම් {n}කට ගුරුවරයා අහිමි වේ', '{n} தெரிவுத் தொகுதிக் குழு(க்கள்) ஆசிரியரை இழக்கும்'],
  '{n} class(es) lose their class teacher': ['පන්ති {n}කට පන්ති භාර ගුරුවරයා අහිමි වේ', '{n} வகுப்பு(கள்) வகுப்பாசிரியரை இழக்கும்'],
  '{n} class(es) lose their home room': ['පන්ති {n}කට තම පන්ති කාමරය අහිමි වේ', '{n} வகுப்பு(கள்) தமது வகுப்பறையை இழக்கும்'],
  '{n} room(s) lose their type': ['කාමර {n}කට වර්ගය අහිමි වේ', '{n} அறை(கள்) வகையை இழக்கும்'],
  '{n} teacher(s) lose their role': ['ගුරුවරුන් {n}කට තනතුර අහිමි වේ', '{n} ஆசிரியர்(கள்) பதவியை இழப்பர்'],
  '{n} section(s) use it': ['අංශ {n}ක් එය භාවිත කරයි', '{n} பிரிவு(கள்) இதைப் பயன்படுத்துகின்றன'],

  'Delete "{name}"?': ['"{name}" මකන්නද?', '"{name}" ஐ நீக்கவா?'],
  'Could not delete': ['මැකිය නොහැකි විය', 'நீக்க முடியவில்லை'],
  'Could not recover': ['නැවත ලබාගත නොහැකි විය', 'மீட்டெடுக்க முடியவில்லை'],
  'You have unsaved changes': ['ඔබට නොසුරැකි වෙනස්කම් ඇත', 'சேமிக்காத மாற்றங்கள் உள்ளன'],

  'unknown class "{cls}"': ['නොදන්නා පන්තිය "{cls}"', 'தெரியாத வகுப்பு "{cls}"'],
  'unknown subject "{subject}"': ['නොදන්නා විෂය "{subject}"', 'தெரியாத பாடம் "{subject}"'],
  'unknown teacher "{teacher}"': ['නොදන්නා ගුරුවරයා "{teacher}"', 'தெரியாத ஆசிரியர் "{teacher}"'],
  'bad periods "{periods}"': ['වැරදි කාලච්ඡේද ගණන "{periods}"', 'தவறான பாடவேளை எண்ணிக்கை "{periods}"'],
  'more doubles than periods allow': ['කාලච්ඡේද ගණනට වඩා ද්විත්ව කාලච්ඡේද', 'பாடவேளைகளை விட அதிக இரட்டைப் பாடவேளைகள்'],
  'cannot read "{cell}"': ['"{cell}" කියවිය නොහැක', '"{cell}" ஐப் படிக்க முடியவில்லை'],

  '{cls} {subject} on only {n} day(s)': ['{cls} {subject} දින {n}ක පමණි', '{cls} {subject} {n} நாள்(களில்) மட்டும்'],
} satisfies Dict;
