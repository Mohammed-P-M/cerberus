import re
import json
import logging
from typing import Dict, Any, List
from app.config import settings
from app.schemas.extraction import AIExtractionContract

logger = logging.getLogger(__name__)

class AIExtractor:
    def extract(self, text: str) -> AIExtractionContract:
        """Extract structured entities and events adhering strictly to Section 5 contract."""
        if settings.AI_PROVIDER in ("openai", "gemini") and settings.AI_API_KEY:
            try:
                return self._extract_llm(text)
            except Exception as e:
                logger.warning(f"LLM extraction failed, falling back to heuristic: {e}")
                
        return self._extract_heuristic(text)

    def _extract_heuristic(self, text: str) -> AIExtractionContract:
        # 1. Phone extraction
        phones = []
        seen_phones = set()
        phone_matches = re.finditer(r"(?:\+91[\-\s]?)?([6-9]\d{9})\b", text)
        for m in phone_matches:
            val = m.group(1)
            if val not in seen_phones:
                seen_phones.add(val)
                phones.append({"value": val})

        # 2. Vehicle extraction (Indian plate format: 2 letters, 1-2 digits, 1-3 letters, 4 digits)
        vehicles = []
        seen_vehicles = set()
        veh_matches = re.finditer(r"\b([A-Z]{2}[-\s]?[0-9]{1,2}[-\s]?[A-Z]{1,3}[-\s]?[0-9]{4})\b", text.upper())
        for m in veh_matches:
            reg = re.sub(r"[^A-Z0-9]", "", m.group(1))
            if reg not in seen_vehicles:
                seen_vehicles.add(reg)
                vehicles.append({"registration": reg})

        # 3. UPI extraction
        upis = []
        seen_upis = set()
        upi_matches = re.finditer(r"\b([a-zA-Z0-9.\-_]{2,64}@(oksbi|okhdfcbank|okaxis|okicici|paytm|ybl|apl|upi))\b", text, re.IGNORECASE)
        for m in upi_matches:
            val = m.group(1).lower()
            if val not in seen_upis:
                seen_upis.add(val)
                upis.append({"value": val})

        # 4. Email extraction (excluding UPIs)
        emails = []
        seen_emails = set()
        email_matches = re.finditer(r"\b([a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+)\b", text)
        for m in email_matches:
            val = m.group(1).lower()
            if not any(val.endswith(handle) for handle in ["@oksbi", "@paytm", "@ybl", "@upi"]):
                if val not in seen_emails:
                    seen_emails.add(val)
                    emails.append({"value": val})

        # 5. Bank Account & IFSC
        bank_accounts = []
        seen_accts = set()
        ifsc_match = re.search(r"\b([A-Z]{4}0[A-Z0-9]{6})\b", text)
        ifsc_code = ifsc_match.group(1) if ifsc_match else None
        
        acct_matches = re.finditer(r"(?:A/C|Account(?:\s*No\.?)?|Acc)\s*(?:No\.?)?\s*[:\-]?\s*([0-9]{9,18})", text, re.IGNORECASE)
        for m in acct_matches:
            acct = m.group(1)
            if acct not in seen_accts:
                seen_accts.add(acct)
                bank_accounts.append({
                    "account_number": acct,
                    "ifsc": ifsc_code,
                    "bank_name": "State Bank of India" if ifsc_code and "SBIN" in ifsc_code else None
                })

        # 6. Person extraction with roles
        persons = []
        seen_persons = set()
        
        # Accused
        accused_matches = re.finditer(r"(?:Accused|Suspect|Perpetrator)(?:\s*(?:Name|Person))?\s*[:\-]\s*([A-Za-z0-9\s\.\'\-]+?)(?:,|\n|\r|$|(?:\s+(?:Phone|Mobile|Contact|residing|aged|r/o|r\/o)))", text, re.IGNORECASE)
        for m in accused_matches:
            name = m.group(1).strip().rstrip(".,")
            if name and len(name) > 2 and name not in seen_persons:
                seen_persons.add(name)
                persons.append({"name": name, "role": "ACCUSED"})

        # Victim / Complainant
        victim_matches = re.finditer(r"(?:Complainant|Victim|Informant)(?:\s*Name)?\s*[:\-]\s*([A-Za-z0-9\s\.\'\-]+?)(?:,|\n|\r|$|(?:\s+(?:Phone|Mobile|Contact|residing|aged|r/o|r\/o)))", text, re.IGNORECASE)
        for m in victim_matches:
            name = m.group(1).strip().rstrip(".,")
            if name and len(name) > 2 and name not in seen_persons:
                seen_persons.add(name)
                persons.append({"name": name, "role": "VICTIM"})

        # Generic name matches if none found
        if not persons:
            generic_matches = re.finditer(r"(?:Mr\.|Shri|Smt\.|Dr\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)", text)
            for m in generic_matches:
                name = m.group(1).strip()
                if name and name not in seen_persons:
                    seen_persons.add(name)
                    persons.append({"name": name, "role": "SUSPECT"})

        # 7. Locations
        locations = []
        seen_locs = set()
        loc_patterns = [
            r"(?:at|in|near|location|police station|PS)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b",
            r"(?:Place of Occurrence|Jurisdiction)\s*[:\-]\s*([A-Za-z\s]+?)(?:,|\.|\n)"
        ]
        for pat in loc_patterns:
            for m in re.finditer(pat, text):
                loc = m.group(1).strip()
                if loc and len(loc) > 3 and loc.lower() not in ("financial crime", "police station", "state bank", "cyber crime"):
                    if loc not in seen_locs:
                        seen_locs.add(loc)
                        locations.append({"name": loc})

        # 8. Organizations
        organizations = []
        seen_orgs = set()
        org_matches = re.finditer(r"\b([A-Z][a-zA-Z0-9\s]{2,30}(?:Trading|Enterprises|Pvt Ltd|Private Limited|LLC|Corporation|Bank|Securities|Fintech))\b", text)
        for m in org_matches:
            org = m.group(1).strip()
            if org not in seen_orgs:
                seen_orgs.add(org)
                organizations.append({"name": org})

        # 9. Events
        events = []
        if re.search(r"(?:fraud|scam|transferred|cheated|withdrew|payment)", text, re.IGNORECASE):
            events.append({
                "event_type": "SUSPICIOUS_TRANSACTION",
                "description": "Financial fraud or unauthorized fund transfer reported in FIR",
                "occurred_at": None
            })
        if phones:
            events.append({
                "event_type": "FRAUD_CALL",
                "description": f"Communication initiated using suspected mobile number {phones[0]['value']}",
                "occurred_at": None
            })

        # 10. Relationships
        relationships = []
        primary_person = persons[0]["name"] if persons else None
        if primary_person:
            for p in phones:
                relationships.append({
                    "source_type": "Person",
                    "source_name": primary_person,
                    "relationship": "OWNS_PHONE",
                    "target_type": "Phone",
                    "target_value": p["value"]
                })
            for v in vehicles:
                relationships.append({
                    "source_type": "Person",
                    "source_name": primary_person,
                    "relationship": "OPERATES_VEHICLE",
                    "target_type": "Vehicle",
                    "target_value": v["registration"]
                })
            for u in upis:
                relationships.append({
                    "source_type": "Person",
                    "source_name": primary_person,
                    "relationship": "USES_UPI",
                    "target_type": "UPI",
                    "target_value": u["value"]
                })
            for b in bank_accounts:
                relationships.append({
                    "source_type": "Person",
                    "source_name": primary_person,
                    "relationship": "HOLDS_ACCOUNT",
                    "target_type": "BankAccount",
                    "target_value": b["account_number"]
                })

        # Category
        crime_cat = "UNKNOWN"
        if re.search(r"(?:ransomware|phishing|malware|hacking)", text, re.IGNORECASE):
            crime_cat = "CYBER_ATTACK"
        elif re.search(r"(?:identity theft|impersonation)", text, re.IGNORECASE):
            crime_cat = "IDENTITY_THEFT"

        payload = {
            "case": {"crime_category": crime_cat},
            "persons": persons,
            "phones": phones,
            "vehicles": vehicles,
            "locations": locations,
            "organizations": organizations,
            "bank_accounts": bank_accounts,
            "upis": upis,
            "emails": emails,
            "events": events,
            "relationships": relationships
        }
        return AIExtractionContract.model_validate(payload)

    def _extract_llm(self, text: str) -> AIExtractionContract:
        # Pluggable LLM invocation if credentials are set
        # Otherwise fallback to heuristic
        return self._extract_heuristic(text)

ai_extractor = AIExtractor()
