"""Typed, single-use proposals for externally visible actions."""

import os
import re
from html import unescape
from pathlib import Path
from typing import Annotated, Literal
from urllib.parse import urlsplit

import httpx
from pydantic import Field

from .hub_models import Input, Language, local_base


class WebSearch(Input):
    kind: Literal["web_search"]
    query: str = Field(min_length=1, max_length=250)
    language: Language = "en"


class WebRead(Input):
    kind: Literal["web_read"]
    title: str = Field(min_length=1, max_length=250)
    language: Language = "en"


class SearchEngine(Input):
    kind: Literal["search_engine"]
    query: str = Field(min_length=1, max_length=250)
    language: Language = "en"


class OpenBrowser(Input):
    kind: Literal["open_browser"]
    url: str = Field(min_length=1, max_length=1500)


class ReadFile(Input):
    kind: Literal["read_file"]
    filename: str = Field(pattern=r"^[\w][\w .-]{0,95}\.(txt|md|json|csv|log)$")


class Telegram(Input):
    kind: Literal["telegram"]
    recipient: str = Field(pattern=r"^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$")
    text: str = Field(min_length=1, max_length=4000)


class WhatsApp(Input):
    kind: Literal["whatsapp"]
    recipient: str = Field(pattern=r"^\+?[1-9]\d{6,14}$")
    text: str = Field(min_length=1, max_length=4000)


Action = Annotated[
    WebSearch | WebRead | SearchEngine | OpenBrowser | ReadFile | Telegram | WhatsApp,
    Field(discriminator="kind"),
]


def capabilities() -> dict[str, bool]:
    return {
        "web_search": True,
        "web_read": True,
        "search_engine": bool(os.environ.get("EVIDENCELAB_SEARXNG_URL")),
        "open_browser": os.environ.get("EVIDENCELAB_DESKTOP_ACTIONS") == "1",
        "read_file": bool(os.environ.get("EVIDENCELAB_SHARED_FILES")),
        "telegram": bool(os.environ.get("EVIDENCELAB_TELEGRAM_TOKEN")),
        "whatsapp": all(
            os.environ.get(key)
            for key in (
                "EVIDENCELAB_WHATSAPP_TOKEN",
                "EVIDENCELAB_WHATSAPP_PHONE_ID",
                "EVIDENCELAB_META_GRAPH_VERSION",
            )
        ),
    }


def execute(action: Action) -> dict:
    if not capabilities()[action.kind]:
        raise ValueError("This integration is disabled. See docs/hub.md for setup.")
    if isinstance(action, OpenBrowser):
        import webbrowser

        url = urlsplit(action.url)
        if (
            url.scheme != "https"
            or not url.hostname
            or url.username
            or url.password
            or "\\" in action.url
            or any(char.isspace() for char in action.url)
        ):
            raise ValueError("Only standard HTTPS URLs without credentials can be opened.")
        if not webbrowser.open(action.url, new=2):
            raise ValueError("Could not hand the URL to the desktop browser.")
        return {"opened": action.url}
    if isinstance(action, ReadFile):
        folder = Path(os.environ["EVIDENCELAB_SHARED_FILES"]).expanduser().resolve()
        if not folder.is_dir() or folder == Path.home().resolve() or folder == Path(folder.anchor):
            raise ValueError("Configure a dedicated shared folder for this action.")
        import stat

        try:
            directory = os.open(folder, os.O_RDONLY | os.O_DIRECTORY)
            try:
                fd = os.open(action.filename, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory)
                with os.fdopen(fd, "rb") as stream:
                    if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
                        raise ValueError("Only regular text files in the shared folder can be read.")
                    content = stream.read(32769)
            finally:
                os.close(directory)
            return {
                "filename": action.filename,
                "text": content[:32768].decode("utf-8"),
                "truncated": len(content) > 32768,
            }
        except (OSError, UnicodeError) as error:
            raise ValueError("Could not read that UTF-8 file from the shared folder.") from error
    with httpx.Client(
        timeout=12,
        trust_env=False,
        headers={"User-Agent": "EvidenceLab/0.2 (https://github.com/massibrevo/evidencelab)"},
    ) as client:
        try:
            if isinstance(action, SearchEngine):
                base = local_base("EVIDENCELAB_SEARXNG_URL", "http://127.0.0.1:8080")
                response = client.get(
                    f"{base}/search",
                    params={
                        "q": action.query,
                        "format": "json",
                        "language": action.language,
                    },
                )
                response.raise_for_status()
                return {
                    "results": [
                        {
                            "title": str(row.get("title", ""))[:250],
                            "snippet": str(row.get("content", ""))[:1000],
                            "url": str(row.get("url", ""))[:1500],
                        }
                        for row in response.json()["results"][:5]
                    ]
                }
            if isinstance(action, (WebSearch, WebRead)):
                base = f"https://{action.language}.wikipedia.org"
                if isinstance(action, WebSearch):
                    response = client.get(
                        f"{base}/w/rest.php/v1/search/page", params={"q": action.query, "limit": 5}
                    )
                    response.raise_for_status()
                    return {
                        "results": [
                            {
                                "title": page["title"],
                                "snippet": unescape(re.sub(r"<[^>]+>", "", page["excerpt"])),
                                "url": str(
                                    httpx.URL(f"{base}/wiki/").copy_with(
                                        path="/wiki/" + page["key"].replace("%", "%25")
                                    )
                                ),
                            }
                            for page in response.json()["pages"]
                        ]
                    }
                response = client.get(
                    f"{base}/w/api.php",
                    params={
                        "action": "query",
                        "prop": "extracts|info",
                        "inprop": "url",
                        "explaintext": "1",
                        "exintro": "1",
                        "titles": action.title,
                        "redirects": "1",
                        "format": "json",
                        "formatversion": "2",
                    },
                )
                response.raise_for_status()
                page = response.json()["query"]["pages"][0]
                if page.get("missing"):
                    raise ValueError("Wikipedia did not find that article.")
                return {
                    "title": page["title"],
                    "text": page.get("extract", "")[:12000],
                    "url": page.get("fullurl"),
                }
            if isinstance(action, Telegram):
                token = os.environ["EVIDENCELAB_TELEGRAM_TOKEN"]
                if not re.fullmatch(r"\d+:[A-Za-z0-9_-]+", token):
                    raise ValueError("Check Telegram token format.")
                response = client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={"chat_id": action.recipient, "text": action.text},
                )
                response.raise_for_status()
                return {"message_id": response.json()["result"]["message_id"]}
            version = os.environ["EVIDENCELAB_META_GRAPH_VERSION"]
            phone = os.environ["EVIDENCELAB_WHATSAPP_PHONE_ID"]
            if not re.fullmatch(r"v\d+\.\d+", version) or not phone.isdecimal():
                raise ValueError("Check WhatsApp Graph API version and phone number ID.")
            response = client.post(
                f"https://graph.facebook.com/{version}/{phone}/messages",
                headers={"Authorization": "Bearer " + os.environ["EVIDENCELAB_WHATSAPP_TOKEN"]},
                json={
                    "messaging_product": "whatsapp",
                    "to": action.recipient.lstrip("+"),
                    "type": "text",
                    "text": {"body": action.text},
                },
            )
            response.raise_for_status()
            return {"message_id": response.json()["messages"][0]["id"]}
        except httpx.HTTPStatusError as error:
            detail = " Check account access and recipient." if isinstance(action, (Telegram, WhatsApp)) else ""
            raise ValueError(f"Provider returned HTTP {error.response.status_code}.{detail}") from None
        except (httpx.RequestError, KeyError, TypeError, IndexError):
            raise ValueError("The provider response was unavailable or invalid.") from None
