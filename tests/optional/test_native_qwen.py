"""Architecture compatibility only: random miniature weights, no checkpoint downloads."""

import os

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("EVIDENCELAB_TEST_MODELS") != "1", reason="Explicit optional model test"
)


def test_native_qwen_text_loading_generation_and_adapter_roundtrip(tmp_path):
    import torch
    from peft import LoraConfig, PeftModel, get_peft_model
    from transformers import (
        Qwen3_5Config,
        Qwen3_5ForCausalLM,
        Qwen3_5ForConditionalGeneration,
        Qwen3_5TextConfig,
        Qwen3_5VisionConfig,
    )

    torch.manual_seed(42)
    config = Qwen3_5TextConfig(
        vocab_size=64,
        hidden_size=32,
        intermediate_size=64,
        num_hidden_layers=2,
        num_attention_heads=4,
        num_key_value_heads=2,
        head_dim=8,
        linear_num_key_heads=2,
        linear_num_value_heads=4,
        linear_key_head_dim=8,
        linear_value_head_dim=8,
        layer_types=["linear_attention", "full_attention"],
        max_position_embeddings=128,
    )
    vision = Qwen3_5VisionConfig(
        depth=1, hidden_size=32, intermediate_size=64, num_heads=4, out_hidden_size=32
    )
    original = Qwen3_5ForConditionalGeneration(
        Qwen3_5Config(text_config=config.to_dict(), vision_config=vision.to_dict())
    )
    original.save_pretrained(tmp_path / "base")
    text, info = Qwen3_5ForCausalLM.from_pretrained(tmp_path / "base", output_loading_info=True)
    assert not info["missing_keys"]
    assert torch.equal(text.model.embed_tokens.weight, original.model.language_model.embed_tokens.weight)
    ids = torch.tensor([[1, 2, 3, 4]])
    text.eval()
    with torch.no_grad():
        assert text(ids).logits.shape == (1, 4, 64)
        assert text.generate(
            ids, max_new_tokens=2, do_sample=False, pad_token_id=0, eos_token_id=63
        ).shape == (1, 6)
    adapted = get_peft_model(
        text, LoraConfig(r=2, lora_alpha=4, target_modules=["q_proj", "v_proj"], task_type="CAUSAL_LM")
    )
    adapted.train()
    optimizer = torch.optim.SGD([p for p in adapted.parameters() if p.requires_grad], lr=0.01)
    loss = adapted(ids, labels=ids).loss
    loss.backward()
    optimizer.step()
    adapted.eval()
    with torch.no_grad():
        expected = adapted(ids).logits
    adapted.save_pretrained(tmp_path / "adapter")
    loaded = PeftModel.from_pretrained(
        Qwen3_5ForCausalLM.from_pretrained(tmp_path / "base"), tmp_path / "adapter"
    ).eval()
    with torch.no_grad():
        assert torch.allclose(loaded(ids).logits, expected, atol=1e-6)
