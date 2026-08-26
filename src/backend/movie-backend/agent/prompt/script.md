<!-- high quality -->

```bash

uv run mlx_audio.tts.generate \
 --model Qwen/Qwen3-TTS-12Hz-1.7B-Base \
 --text "Ghost reporting. ... 你好嗎?" \
 --ref_audio ./reference_voice.wav \
 --play --output ./out --audio_format mp3 --stream --save --instruct "slow down"



uv run mlx_audio.tts.generate \
 --model Qwen/Qwen3-TTS-12Hz-1.7B-Base \
 --text "Ghost reporting. ... 你好嗎?" \
 --ref_audio ./reference_voice.wav \
 --play --output ./out --audio_format mp3 --stream --save --instruct "slow down"

```

<!-- mlx-community/Kokoro-82M-bf16 -->

<!-- Low quality -->

```bash

uv run mlx_audio.tts.generate \
 --model Qwen/Qwen3-TTS-12Hz-0.6B-Base \
 --text "Ghost reporting. 中秋節快樂！ 明月幾時有？把酒問青天。不知天上宮闕，今夕是何年。我欲乘風歸去，又恐瓊樓玉宇，高處不勝寒。起舞弄清影，何似在人間！轉朱閣，低綺戶，照無眠。不應有恨，何事長向別時圓？人有悲歡離合，月有陰晴圓缺，此事古難全。但願人長久，千里共嬋娟。 中秋節快樂！" \
 --ref_audio ./reference_voice.wav \
 --play --output ./out --audio_format mp3 --stream --save --instruct "slow down"



uv run mlx_audio.tts.generate \
 --model Qwen/Qwen3-TTS-12Hz-0.6B-Base \
 --text "ghost reporting! Hi how are you?" \
 --ref_audio ./reference_voice.wav \
 --play --output ./out --audio_format mp3 --stream --save --instruct "slow down"


```

# Image editing

## 4B OK FOR COMMERCAIL USE APACHE LICENSE

```bash

mlxgen download --model AbstractFramework/flux.2-klein-4b-8bit

mlxgen generate \
  --image input.jpeg \
  --prompt "The person and The ninja standing next to each other, in a studio, taking photo." \
  --image person.png \
  --output result.png \
  --model AbstractFramework/flux.2-klein-4b-8bit \
  --mlx-cache-limit-gb 20 \
  --steps 5 --seed 42 --width 1024 --height 1024

```

#

#

# Upscale to 2048

```bash
####

mlxgen download --model AbstractFramework/seedvr2-7b-8bit

mlxgen upscale \
  --model AbstractFramework/seedvr2-7b-8bit \
  --image-path input.png \
  --resolution 2048 \
  --seed 42 \
  --mlx-cache-limit-gb 100 \
  --output input_upscaled_2048.png


mlxgen upscale \
  --model AbstractFramework/seedvr2-7b-8bit \
  --image-path input.png \
  --resolution 1x \
  --seed 42 \
  --mlx-cache-limit-gb 100 \
  --output input_refined_1x.png


```

# upscale video

```bash

mlxgen download --model AbstractFramework/seedvr2-7b-8bit

mlxgen upscale \
  --model AbstractFramework/seedvr2-7b-8bit \
  --video-path input.mp4 \
  --resolution 720 \
  --temporal-chunk-size 29 \
  --temporal-chunk-overlap 8 \
  --mlx-cache-limit-gb 64 \
  --force-unsafe-video-memory \
  --metadata \
  --output upscalde_video.mp4



mlxgen upscale \
  --model AbstractFramework/seedvr2-7b-8bit \
  --video-path input.mp4 \
  --resolution 2x \
  --mlx-cache-limit-gb 64 \
  --force-unsafe-video-memory \
  --output upscalde_video.mp4


```

```bash


##
##
##

cd to workspace/python-src/dots-tts-mlx

# 1. install the quant-aware runtime (>= v0.2.0)
pip install "git+https://github.com/sb1992/dots-tts-mlx.git@v0.2.0"

# 2. download the variant you want  (use "mf-int4/*" for the faster MeanFlow decoder)
hf download shraey/dots-tts-mlx --include "mf-int4/*" --local-dir ./dots-tts-mlx-weights

# 1. install the quant-aware runtime (>= v0.2.0)
pip install "git+https://github.com/sb1992/dots-tts-mlx.git@v0.2.0"

# 2. download the variant you want  (use "mf-int4/*" for the faster MeanFlow decoder)
hf download shraey/dots-tts-mlx --include "int4/*" --local-dir ./dots-tts-mlx-weights

# 2. download the variant you want  (use "mf-int4/*" for the faster MeanFlow decoder)
hf download shraey/dots-tts-mlx --include "mf-int4/*" --local-dir ./dots-tts-mlx-weights

# 3. run (files land in ./dots-tts-mlx-weights/int4/)
dots-tts --model ./dots-tts-mlx-weights/int4 \
    --text "Hello from MLX." --ref-audio reference.wav --language YUE \
    --out-path out --out-prefix clone

dots-tts --model ./dots-tts-mlx-weights/mf-int4 \
    --text "我講一個笑話比你聽. 有一日，個阿伯去茶餐廳食飯，嗌咗個「揚州炒飯」。食食吓，阿伯叫住伙計：「哥仔！你呢個揚州炒飯裡面，點解連一隻蝦都冇嘅？」伙計好冷靜咁答佢：「阿伯，咁你食『煲仔飯』嗰陣，裡面又有冇煲仔呀？」" \
    --ref-audio reference.wav --language YUE \
    --out-path out --out-prefix cantonese; \
afplay ./out/cantonese_000.wav


dots-tts --model ./dots-tts-mlx-weights/int4 \
    --text "Ghost reporting. 我講一個笑話比你聽. 有一日，個阿伯去茶餐廳食飯，嗌咗個「揚州炒飯」。食食吓，阿伯叫住伙計：「哥仔！你呢個揚州炒飯裡面，點解連一隻蝦都冇嘅？」伙計好冷靜咁答佢：「阿伯，咁你食『煲仔飯』嗰陣，裡面又有冇煲仔呀？」" \
    --ref-audio reference.wav --language YUE \
    --out-path out --out-prefix fast; \

afplay ./out/fast_000.wav


dots-tts --model ./dots-tts-mlx-weights/int4 \
    --text "Ghost reporting. 今日有d dry. 等我講一個笑話比你聽啦！ 有一日，個阿伯去茶餐廳食飯，嗌咗個「揚州炒飯」。食食吓，阿伯叫住伙計：「哥仔！你呢個揚州炒飯裡面，點解連一隻蝦都冇嘅？」伙計好冷靜咁答佢：「阿伯，咁你食『煲仔飯』嗰陣，裡面又有冇煲仔呀？」 哈哈哈哈" \
    --ref-audio reference.wav --language YUE \
    --out-path out --out-prefix good_int4; \
afplay ./out/good_int4_000.wav


dots-tts --model ./dots-tts-mlx-weights/mf-int4 \
    --text "Ghost reporting. 今日有d dry. 等我講一個笑話比你聽啦！ 有一日，個阿伯去茶餐廳食飯，嗌咗個「揚州炒飯」。食食吓，阿伯叫住伙計：「哥仔！你呢個揚州炒飯裡面，點解連一隻蝦都冇嘅？」伙計好冷靜咁答佢：「阿伯，咁你食『煲仔飯』嗰陣，裡面又有冇煲仔呀？」 哈哈哈哈" \
    --ref-audio reference.wav --language YUE \
    --out-path out --out-prefix good_mf-int4; \

afplay ./out/good_mf-int4_000.wav


## not very good.

# Faster 15 steps
# cwd at the git folder
uv run ltx-2-mlx a2v --image /Users/loklok/coder-workspace/cantonese/food.png --audio /Users/loklok/coder-workspace/cantonese/food-short.wav --frame-rate 24 --output ./out-mp4 --prompt "scene at restarurant" --stage1-steps 15 --stage2-steps 3

# Standard 30 steps
# cwd at the git folder

uv run ltx-2-mlx a2v --image /Users/loklok/coder-workspace/cantonese/food.png --audio /Users/loklok/coder-workspace/cantonese/food-short.wav --frame-rate 24 --output ./out-mp4 --prompt "scene at restarurant" --stage1-steps 30 --stage2-steps 3


uv run ltx-2-mlx a2v --image /Users/loklok/coder-workspace/cantonese/food.png --audio /Users/loklok/coder-workspace/cantonese/food-short.wav --frame-rate 24 --frames 481 --output ./out/yo.mp4 --prompt "happy food ondering story at the restarurant" --stage1-steps 8 --stage2-steps 3


mkdir dots-tts-mlx
git clone https://github.com/sb1992/dots-tts-mlx.git
cd dots-tts-mlx
uv run pip install -e .

##
##
##
## dgrauet/ltx-2.3-mlx (High Quality)
## dgrauet/ltx-2.3-mlx-q8 (Standard Quality)
##
##
##


mlxgen generate \
  --model AbstractFramework/qwen-image-edit-2511-8bit \
  --image kick.png \
  --task image-to-image \
  --i2i-mode "edit" \
  --prompt "make the character stand naturally and have a victory pose with his hand with a happy smile." \
  --steps 4 \
  --seed 42 \
  --mlx-cache-limit-gb 20 \
  --output edited.png \
  --width 1024 \
  --height 1024

```
