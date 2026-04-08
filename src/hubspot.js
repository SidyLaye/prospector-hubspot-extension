// src/hubspot.js — HubSpot CRM API module

const HS_BASE = 'https://api.hubapi.com';

export async function hsRequest(method, path, body, apiKey) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Vérifie que la clé API est valide
export async function validateApiKey(apiKey) {
  const { ok, data } = await hsRequest('GET', '/crm/v3/objects/contacts?limit=1', null, apiKey);
  return { valid: ok, error: data?.message };
}

// Chercher un contact existant par email, nom ou téléphone
export async function findContact(prospect, apiKey) {
  // 1. Par email (le plus fiable)
  if (prospect.email) {
    const { ok, data } = await hsRequest('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [{ propertyName: 'email', operator: 'EQ', value: prospect.email }]
      }],
      limit: 1,
      properties: ['firstname', 'lastname', 'email', 'company', 'phone'],
    }, apiKey);
    if (ok && data.total > 0) return { found: true, id: data.results[0].id, method: 'email' };
  }

  // 2. Par prénom + nom
  if (prospect.firstname && prospect.lastname) {
    const { ok, data } = await hsRequest('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [
          { propertyName: 'firstname', operator: 'EQ', value: prospect.firstname },
          { propertyName: 'lastname',  operator: 'EQ', value: prospect.lastname  },
        ]
      }],
      limit: 1,
      properties: ['firstname', 'lastname', 'email', 'company'],
    }, apiKey);
    if (ok && data.total > 0) return { found: true, id: data.results[0].id, method: 'name' };
  }

  // 3. Par téléphone
  if (prospect.phone) {
    const cleanPhone = prospect.phone.replace(/\s/g, '');
    const { ok, data } = await hsRequest('POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [{ propertyName: 'phone', operator: 'EQ', value: cleanPhone }]
      }],
      limit: 1,
    }, apiKey);
    if (ok && data.total > 0) return { found: true, id: data.results[0].id, method: 'phone' };
  }

  return { found: false };
}

// Construire les propriétés HubSpot depuis un prospect
export function buildHsProperties(prospect) {
  const props = {};

  if (prospect.firstname)  props.firstname        = prospect.firstname;
  if (prospect.lastname)   props.lastname         = prospect.lastname;
  if (prospect.fullname && !prospect.firstname && !prospect.lastname) {
    const parts = prospect.fullname.split(' ');
    props.firstname = parts[0] || '';
    props.lastname  = parts.slice(1).join(' ') || '';
  }
  if (prospect.email)      props.email            = prospect.email.toLowerCase().trim();
  if (prospect.phone)      props.phone            = prospect.phone;
  if (prospect.company)    props.company          = prospect.company;
  if (prospect.jobtitle)   props.jobtitle         = prospect.jobtitle;
  if (prospect.source)     props.hs_analytics_source_data_1 = prospect.source;

  // Statut → lead status HubSpot
  if (prospect.status) {
    props.hs_lead_status = mapLeadStatus(prospect.status);
    props.message = prospect.status; // champ libre aussi
  }

  // Date de RDV → note
  if (prospect.date) {
    props.notes_last_contacted = prospect.date;
  }

  // Champs extra → notes
  const extraEntries = Object.entries(prospect.extra || {});
  if (extraEntries.length) {
    props.notes_last_updated = extraEntries.map(([k, v]) => `${k}: ${v}`).join('\n');
  }

  return props;
}

function mapLeadStatus(status) {
  if (!status) return 'NEW';
  const s = status.toLowerCase();
  if (/effectu|complet|done|réalisé|closed/i.test(s))   return 'CONNECTED';
  if (/obtenu|scheduled|rdv|booked|confirmed/i.test(s))  return 'IN_PROGRESS';
  if (/qualif/i.test(s))                                  return 'QUALIFIED';
  if (/perdu|lost|unqualif|cancel/i.test(s))              return 'UNQUALIFIED';
  if (/contact|attempt|essai/i.test(s))                   return 'ATTEMPTED_TO_CONTACT';
  return 'NEW';
}

// Créer un contact
export async function createContact(prospect, apiKey) {
  const properties = buildHsProperties(prospect);
  const { ok, status, data } = await hsRequest('POST', '/crm/v3/objects/contacts', { properties }, apiKey);

  if (ok) return { result: 'created', id: data.id };
  if (status === 409 || data?.category === 'CONFLICT') return { result: 'exists', id: data?.id };
  return { result: 'error', error: data?.message || `HTTP ${status}` };
}

// Mettre à jour un contact existant
export async function updateContact(hsId, prospect, apiKey) {
  const properties = buildHsProperties(prospect);
  const { ok, data, status } = await hsRequest('PATCH', `/crm/v3/objects/contacts/${hsId}`, { properties }, apiKey);

  if (ok) return { result: 'updated', id: hsId };
  return { result: 'error', error: data?.message || `HTTP ${status}` };
}

// Import principal : find → create or update
export async function syncProspect(prospect, apiKey, mode = 'upsert') {
  try {
    const found = await findContact(prospect, apiKey);

    if (found.found) {
      if (mode === 'skip') return { result: 'exists', id: found.id, method: found.method };
      if (mode === 'upsert' || mode === 'update') {
        return await updateContact(found.id, prospect, apiKey);
      }
    }

    return await createContact(prospect, apiKey);
  } catch (e) {
    return { result: 'error', error: e.message };
  }
}
