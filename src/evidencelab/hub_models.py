"""Explicitly configured local text generation providers."""

import json
import os
from importlib.util import find_spec
from pathlib import Path
from threading import RLock
from time import perf_counter
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

from .models import MODEL_IDS, ModelConfig, TransformersGenerator, cached_checkpoint

Language = Literal["en", "it", "es"]
LANGUAGES = {"en": "English", "it": "Italian", "es": "Spanish"}
NATIVE_CATALOG = {
    "TinyLlama/TinyLlama-1.1B-Chat-v1.0": "1.1B",
    MODEL_IDS["qwen-0.8b"]: "0.8B",
    MODEL_IDS["qwen-4b"]: "4B",
}


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ModelRef(Input):
    provider: Literal["ollama", "compatible", "transformers", "adapter"]
    name: str = Field(min_length=1, max_length=512)


class Message(Input):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=16000)


class ChatInput(Input):
    model: ModelRef
    messages: list[Message] = Field(min_length=1, max_length=24)
    language: Language = "en"
    max_tokens: int = Field(default=512, ge=16, le=2048)


def local_base(env: str, default: str) -> str:
    url = httpx.URL(os.environ.get(env, default))
    if (
        url.scheme not in {"http", "https"}
        or url.host not in {"127.0.0.1", "localhost", "::1"}
        or url.userinfo
        or url.query
        or url.fragment
    ):
        raise ValueError(f"{env} must point to a loopback HTTP service")
    # Use a numeric loopback address even when the configured host is localhost.
    return str(url.copy_with(host="127.0.0.1") if url.host == "localhost" else url).rstrip("/")


def cached_inventory() -> list[dict]:
    """List supported local snapshots without network access or importing Torch."""
    if not all(find_spec(package) is not None for package in ("torch", "transformers", "huggingface_hub")):
        return []
    models = []
    for name, parameters in NATIVE_CATALOG.items():
        try:
            source = Path(cached_checkpoint(name))
            index = source / "model.safetensors.index.json"
            files = (
                set(json.loads(index.read_text())["weight_map"].values())
                if index.is_file()
                else {"model.safetensors"}
            )
            if not files or any(not isinstance(file, str) or Path(file).name != file for file in files):
                continue
            if not (source / "config.json").is_file() or not (source / "tokenizer_config.json").is_file():
                continue
            if not any((source / file).is_file() for file in ("tokenizer.json", "tokenizer.model")):
                continue
            if not all((source / file).is_file() for file in files):
                continue
            config = json.loads((source / "config.json").read_text())
            models.append(
                {
                    "provider": "transformers",
                    "name": name,
                    "parameters": parameters,
                    "format": "safetensors",
                    "family": config.get("model_type"),
                    "size_bytes": sum((source / file).stat().st_size for file in files),
                    "context_tokens": (config.get("text_config") or config).get("max_position_embeddings"),
                    "revision": source.name,
                }
            )
        except (OSError, ValueError, KeyError, TypeError):
            # Incomplete and absent snapshots can still be added explicitly after download.
            continue
    return models


class LocalModels:
    def __init__(self, home: Path, lock: RLock):
        self.home = home
        self.lock = lock
        self.loaded: tuple[ModelRef, object, object] | None = None

    def base(self, provider: str) -> str:
        if provider == "ollama":
            return local_base("EVIDENCELAB_OLLAMA_URL", "http://127.0.0.1:11434")
        return local_base("EVIDENCELAB_COMPATIBLE_URL", "http://127.0.0.1:1234/v1")

    def inventory(self) -> dict:
        models = []
        status = {}
        for provider, path, key in [("ollama", "/api/tags", "models"), ("compatible", "/models", "data")]:
            try:
                with httpx.Client(timeout=1.5, trust_env=False) as client:
                    response = client.get(self.base(provider) + path)
                    response.raise_for_status()
                    for row in response.json()[key]:
                        name = row.get("name") if provider == "ollama" else row.get("id")
                        if (
                            isinstance(name, str)
                            and 0 < len(name) <= 512
                            and not name.endswith(("-cloud", ":cloud"))
                        ):
                            info = {"provider": provider, "name": name}
                            if provider == "ollama":
                                details = row.get("details") or {}
                                info.update(
                                    {
                                        "size_bytes": row.get("size"),
                                        "revision": row.get("digest"),
                                        "family": details.get("family"),
                                        "format": details.get("format"),
                                        "parameters": details.get("parameter_size"),
                                        "quantization": details.get("quantization_level"),
                                    }
                                )
                            models.append(info)
                status[provider] = True
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                status[provider] = False
        native = cached_inventory()
        models.extend(native)
        status["transformers"] = bool(native)
        for folder in sorted((self.home / "training").glob("*/adapter")):
            if (folder / "adapter_config.json").is_file():
                try:
                    info = json.loads((folder.parent / "manifest.json").read_text())
                except (OSError, ValueError):
                    continue
                if info.get("status") == "completed" and info.get("model_id") in MODEL_IDS.values():
                    models.append(
                        {
                            "provider": "adapter",
                            "name": folder.parent.name,
                            "family": info["model_id"],
                            "format": "LoRA",
                        }
                    )
        return {"models": models, "status": status}

    def generate(self, ref: ModelRef, messages: list[dict], limit: int = 512) -> dict:
        if sum(len(row["content"]) for row in messages) > 64000:
            raise ValueError("Conversation is too long. Start a new chat or shorten the input.")
        start = perf_counter()
        with self.lock:
            if ref.provider in {"transformers", "adapter"}:
                answer, tokens = self.native(ref, messages, limit)
            else:
                answer, tokens = self.server(ref, messages, limit)
        if not isinstance(answer, str) or not answer.strip():
            raise ValueError("The model returned no text. Try a larger output limit or a different model.")
        return {
            "text": answer.strip(),
            "tokens": tokens,
            "latency_ms": round((perf_counter() - start) * 1000, 1),
        }

    def server(self, ref: ModelRef, messages: list[dict], limit: int) -> tuple[str, int | None]:
        body = {"model": ref.name, "messages": messages, "stream": False}
        ollama = ref.provider == "ollama"
        if ollama:
            if ref.name.endswith(("-cloud", ":cloud")):
                raise ValueError("Select a downloaded Ollama model.")
            body["options"] = {"temperature": 0, "num_predict": limit}
            if ref.name.startswith(("qwen3", "gemma4")):
                body["think"] = False
        else:
            body.update(temperature=0, max_tokens=limit)
        try:
            with httpx.Client(timeout=httpx.Timeout(180, connect=3), trust_env=False) as client:
                response = client.post(
                    self.base(ref.provider) + ("/api/chat" if ollama else "/chat/completions"), json=body
                )
                response.raise_for_status()
                data = response.json()
            if ollama:
                return data["message"]["content"], data.get("eval_count")
            return data["choices"][0]["message"]["content"], (data.get("usage") or {}).get(
                "completion_tokens"
            )
        except httpx.HTTPStatusError as error:
            raise ValueError(
                f"{ref.provider} returned HTTP {error.response.status_code}. "
                "Check that the selected model is installed and loaded."
            ) from error
        except (httpx.RequestError, KeyError, IndexError, TypeError, ValueError) as error:
            raise ValueError(
                f"Could not get a response from {ref.provider}. Check the local server."
            ) from error

    def native(self, ref: ModelRef, messages: list[dict], limit: int) -> tuple[str, int]:
        try:
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
        except ImportError as error:
            raise ValueError("Install optional dependencies with pip install -e '.[models]'.") from error
        if self.loaded is None or self.loaded[0] != ref:
            self.loaded = None
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
            elif torch.cuda.is_available():
                torch.cuda.empty_cache()
            if ref.provider == "adapter":
                if Path(ref.name).name != ref.name or ref.name in {".", ".."}:
                    raise ValueError("Choose an adapter from the local training history.")
                import json

                folder = self.home / "training" / ref.name
                try:
                    info = json.loads((folder / "manifest.json").read_text())
                    if info["status"] != "completed" or info["model_id"] not in MODEL_IDS.values():
                        raise ValueError("Only completed EvidenceLab Qwen adapters can be loaded.")
                    runtime = TransformersGenerator(
                        ModelConfig(
                            model_id=info["model_id"],
                            revision=info.get("resolved_model_commit") or info["revision"],
                            adapter=str(folder / "adapter"),
                        ),
                        local_files_only=True,
                    )
                except (OSError, KeyError, RuntimeError) as error:
                    raise ValueError("Adapter or cached base weights are missing.") from error
                tokenizer, model = runtime.tokenizer, runtime.model
            else:
                device = (
                    "cuda"
                    if torch.cuda.is_available()
                    else "mps"
                    if torch.backends.mps.is_available()
                    else "cpu"
                )
                dtype = torch.float16 if device != "cpu" else torch.float32
                try:
                    options = dict(local_files_only=True, trust_remote_code=False)
                    if ref.name in MODEL_IDS.values():
                        runtime = TransformersGenerator(ModelConfig(model_id=ref.name), local_files_only=True)
                        tokenizer, model = runtime.tokenizer, runtime.model
                    else:
                        source = cached_checkpoint(ref.name)
                        tokenizer = AutoTokenizer.from_pretrained(source, **options)
                        model = (
                            AutoModelForCausalLM.from_pretrained(
                                source,
                                dtype=dtype,
                                use_safetensors=True,
                                **options,
                            )
                            .to(device)
                            .eval()
                        )
                except (OSError, RuntimeError) as error:
                    raise ValueError(
                        "Unable to load local weights. Download a compatible safetensors chat model "
                        "with hf download, or use an Ollama/GGUF runtime."
                    ) from error
            self.loaded = (ref, tokenizer, model)
        _, tokenizer, model = self.loaded
        inputs = tokenizer.apply_chat_template(
            messages,
            tokenize=True,
            add_generation_prompt=True,
            return_dict=True,
            return_tensors="pt",
            enable_thinking=False,
        ).to(model.device)
        length = inputs["input_ids"].shape[-1]
        if length + limit > min(getattr(model.config, "max_position_embeddings", 8192) or 8192, 8192):
            raise ValueError("Context is too long for this model. Shorten the conversation.")
        with torch.inference_mode():
            output = model.generate(**inputs, do_sample=False, max_new_tokens=limit)
        tail = output[0][length:]
        return tokenizer.decode(tail, skip_special_tokens=True), len(tail)
