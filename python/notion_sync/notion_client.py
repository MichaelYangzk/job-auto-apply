from typing import List, Dict, Any, Optional, Sequence
import requests

PROPERTY_TYPES = {
    "Name": "title",
    "Company": "rich_text",
    "Conversation ID": "rich_text",
    "Action Confirm": "checkbox",
    "Status Updated": "checkbox",
    "Email Link": "url",
    "Error": "rich_text",
    "From": "rich_text",
    "Importance Score": "number",
    "LLM Status": "select",
    "Message ID": "rich_text",
    "Next Action": "rich_text",
    "Priority": "select",
    "Received UTC": "date",
    "Stage": "select",
    "Subject": "rich_text",
    "Summary": "rich_text",
}


class NotionClient:
    def __init__(self, token: str = None, database_id: str = None):
        self.token = token
        self.database_id = database_id

    def query_by_conversation_id(self, conversation_id: str) -> List[Dict[str, Any]]:
        raise NotImplementedError()

    def get_page_properties(self, page_id: str) -> Dict[str, Any]:
        raise NotImplementedError()

    def create_page(self, properties: Dict[str, Any], content: str) -> str:
        raise NotImplementedError()

    def update_page(self, page_id: str, properties: Dict[str, Any], content_append: str = None) -> None:
        raise NotImplementedError()

    def append_page_content(self, page_id: str, content: str) -> None:
        raise NotImplementedError()

    def get_page_plaintext(self, page_id: str, page_size: int = 100) -> str:
        raise NotImplementedError()


class HttpNotionClient(NotionClient):
    api_base = "https://api.notion.com/v1"
    notion_version = "2022-06-28"

    def __init__(self, token: str, database_id: str, session: Optional[requests.Session] = None, query_properties: Optional[Sequence[str]] = None, debug: bool = False):
        if not token:
            raise ValueError("Notion token is required")
        if not database_id:
            raise ValueError("Notion database_id is required")
        super().__init__(token=token, database_id=database_id)
        self.session = session or requests.Session()
        self.query_properties = list(query_properties) if query_properties else ["Conversation ID", "Identity"]
        self.debug = debug
        self.property_types: Dict[str, str] = {}

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.token}",
            "Notion-Version": self.notion_version,
            "Content-Type": "application/json",
        }

    def _handle_response(self, resp: requests.Response):
        try:
            resp.raise_for_status()
            return resp
        except requests.HTTPError as e:
            detail = resp.text[:1000] if resp is not None else ""
            raise requests.HTTPError(f"{e} :: {detail}", response=resp) from None

    def _properties_payload(self, properties: Dict[str, Any]) -> Dict[str, Any]:
        payload = {}
        for key, value in properties.items():
            if value is None:
                continue
            if isinstance(value, dict):
                value = str(value)
            ptype = self.property_types.get(key) or PROPERTY_TYPES.get(key, "rich_text")
            if ptype == "number":
                try:
                    payload[key] = {"number": float(value)}
                    continue
                except Exception:
                    pass
            if ptype == "title":
                payload[key] = {"title": [{"type": "text", "text": {"content": str(value)}}]}
            elif ptype == "url":
                payload[key] = {"url": str(value)}
            elif ptype == "date":
                payload[key] = {"date": {"start": str(value)}}
            elif ptype == "checkbox":
                payload[key] = {"checkbox": bool(value)}
            elif ptype == "select":
                payload[key] = {"select": {"name": str(value)}}
            elif ptype == "multi_select":
                if isinstance(value, (list, tuple, set)):
                    names = [str(v) for v in value if v is not None]
                else:
                    names = [str(value)]
                payload[key] = {"multi_select": [{"name": n} for n in names if str(n).strip()]}
            else:
                payload[key] = {"rich_text": [{"type": "text", "text": {"content": str(value)}}]}
        return payload

    def _children_from_content(self, content: str):
        parts = [p for p in content.split("\n\n") if p.strip()]
        if not parts:
            return []
        children = []
        for p in parts:
            children.append(
                {
                    "object": "block",
                    "type": "paragraph",
                    "paragraph": {"rich_text": [{"type": "text", "text": {"content": p}}]},
                }
            )
        return children

    def query_by_conversation_id(self, conversation_id: str) -> List[Dict[str, Any]]:
        url = f"{self.api_base}/databases/{self.database_id}/query"

        def do_query(prop: str, filter_body):
            resp = self.session.post(url, headers=self._headers(), json={"filter": filter_body})
            return self._handle_response(resp)

        last_error = None
        for prop in self.query_properties:
            try:
                resp = do_query(prop, {"property": prop, "rich_text": {"equals": conversation_id}})
                data = resp.json()
                return data.get("results", [])
            except requests.HTTPError as e:
                if "Could not find property" in str(e):
                    last_error = e
                    continue
                last_error = e
            try:
                resp = do_query(prop, {"property": prop, "title": {"equals": conversation_id}})
                data = resp.json()
                return data.get("results", [])
            except requests.HTTPError as e:
                if "Could not find property" in str(e):
                    last_error = e
                    continue
                last_error = e
        if last_error:
            raise last_error
        return []

    def get_database(self) -> Dict[str, Any]:
        url = f"{self.api_base}/databases/{self.database_id}"
        resp = self.session.get(url, headers=self._headers())
        self._handle_response(resp)
        return resp.json()

    def ensure_properties(self, required: Dict[str, str]) -> Dict[str, str]:
        db = self.get_database()
        existing = db.get("properties", {})
        self.property_types.update({name: meta.get("type") for name, meta in existing.items()})

        to_add = {}
        for name, typ in required.items():
            if name in existing:
                continue
            if typ == "number":
                to_add[name] = {"number": {}}
            elif typ == "title":
                to_add[name] = {"title": {}}
            elif typ == "select":
                to_add[name] = {"select": {"options": []}}
            elif typ == "url":
                to_add[name] = {"url": {}}
            elif typ == "date":
                to_add[name] = {"date": {}}
            elif typ == "checkbox":
                to_add[name] = {"checkbox": {}}
            else:
                to_add[name] = {"rich_text": {}}

        if to_add:
            url = f"{self.api_base}/databases/{self.database_id}"
            payload = {"properties": to_add}
            resp = self.session.patch(url, headers=self._headers(), json=payload)
            self._handle_response(resp)
            for name, typ in required.items():
                if name in to_add:
                    self.property_types[name] = typ

        return self.property_types

    def get_page_properties(self, page_id: str) -> Dict[str, Any]:
        url = f"{self.api_base}/pages/{page_id}"
        resp = self.session.get(url, headers=self._headers())
        self._handle_response(resp)
        return resp.json().get("properties", {})

    def create_page(self, properties: Dict[str, Any], content: str) -> str:
        url = f"{self.api_base}/pages"
        payload = {
            "parent": {"database_id": self.database_id},
            "properties": self._properties_payload(properties),
            "children": self._children_from_content(content),
        }
        resp = self.session.post(url, headers=self._headers(), json=payload)
        self._handle_response(resp)
        return resp.json().get("id")

    def update_page(self, page_id: str, properties: Dict[str, Any], content_append: str = None) -> None:
        url = f"{self.api_base}/pages/{page_id}"
        payload = {"properties": self._properties_payload(properties)}
        resp = self.session.patch(url, headers=self._headers(), json=payload)
        self._handle_response(resp)
        if content_append:
            self.append_page_content(page_id, content_append)

    def append_page_content(self, page_id: str, content: str) -> None:
        children = self._children_from_content(content)
        if not children:
            return
        url = f"{self.api_base}/blocks/{page_id}/children"
        payload = {"children": children}
        resp = self.session.patch(url, headers=self._headers(), json=payload)
        self._handle_response(resp)

    def _extract_text(self, block: Dict[str, Any]) -> str:
        btype = block.get("type")
        rich = block.get(btype, {}).get("rich_text", []) if btype else []
        parts = []
        for rt in rich:
            text = rt.get("plain_text") or rt.get("text", {}).get("content")
            if text:
                parts.append(text)
        return "".join(parts)

    def get_page_plaintext(self, page_id: str, page_size: int = 100) -> str:
        url = f"{self.api_base}/blocks/{page_id}/children"
        texts = []
        start_cursor = None
        while True:
            params = {"page_size": page_size}
            if start_cursor:
                params["start_cursor"] = start_cursor
            resp = self.session.get(url, headers=self._headers(), params=params)
            self._handle_response(resp)
            data = resp.json()
            for block in data.get("results", []):
                texts.append(self._extract_text(block))
            if not data.get("has_more"):
                break
            start_cursor = data.get("next_cursor")
            if not start_cursor:
                break
        return "\n".join([t for t in texts if t])
