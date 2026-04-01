#include <jni.h>
#include <string>
#include <fstream>
#include <vector>
#include <cstdint>
#include <algorithm>
#include <android/log.h>

#include "libraw/libraw.h"

static constexpr const char *LOG_TAG = "RawImageProcessorJni";

static bool writeBytes(const std::string &path, const uint8_t *data, size_t size) {
  if (data == nullptr || size == 0) return false;
  std::ofstream out(path, std::ios::binary);
  if (!out.is_open()) return false;
  out.write(reinterpret_cast<const char *>(data), static_cast<std::streamsize>(size));
  return out.good();
}

static bool writeBmp24(const std::string &path, int width, int height, const uint8_t *rgb, int stride) {
  if (width <= 0 || height <= 0 || rgb == nullptr) return false;
  const int rowBytes = width * 3;
  const int paddedRowBytes = (rowBytes + 3) & ~3;
  const uint32_t fileHeaderSize = 14;
  const uint32_t infoHeaderSize = 40;
  const uint32_t pixelDataSize = static_cast<uint32_t>(paddedRowBytes * height);
  const uint32_t fileSize = fileHeaderSize + infoHeaderSize + pixelDataSize;

  std::ofstream out(path, std::ios::binary);
  if (!out.is_open()) return false;

  // BITMAPFILEHEADER
  out.put('B');
  out.put('M');
  out.write(reinterpret_cast<const char *>(&fileSize), 4);
  uint32_t reserved = 0;
  out.write(reinterpret_cast<const char *>(&reserved), 4);
  uint32_t pixelOffset = fileHeaderSize + infoHeaderSize;
  out.write(reinterpret_cast<const char *>(&pixelOffset), 4);

  // BITMAPINFOHEADER
  out.write(reinterpret_cast<const char *>(&infoHeaderSize), 4);
  int32_t w = width;
  int32_t h = height;
  out.write(reinterpret_cast<const char *>(&w), 4);
  out.write(reinterpret_cast<const char *>(&h), 4);
  uint16_t planes = 1;
  uint16_t bpp = 24;
  out.write(reinterpret_cast<const char *>(&planes), 2);
  out.write(reinterpret_cast<const char *>(&bpp), 2);
  uint32_t compression = 0;
  out.write(reinterpret_cast<const char *>(&compression), 4);
  out.write(reinterpret_cast<const char *>(&pixelDataSize), 4);
  int32_t ppm = 2835; // ~72 DPI
  out.write(reinterpret_cast<const char *>(&ppm), 4);
  out.write(reinterpret_cast<const char *>(&ppm), 4);
  uint32_t clrUsed = 0;
  uint32_t clrImportant = 0;
  out.write(reinterpret_cast<const char *>(&clrUsed), 4);
  out.write(reinterpret_cast<const char *>(&clrImportant), 4);

  std::vector<uint8_t> row(static_cast<size_t>(paddedRowBytes), 0);
  // BMP rows are bottom-up
  for (int y = height - 1; y >= 0; --y) {
    const uint8_t *src = rgb + static_cast<size_t>(y) * static_cast<size_t>(stride);
    for (int x = 0; x < width; ++x) {
      const int si = x * 3;
      const int di = x * 3;
      row[di + 0] = src[si + 2]; // B
      row[di + 1] = src[si + 1]; // G
      row[di + 2] = src[si + 0]; // R
    }
    out.write(reinterpret_cast<const char *>(row.data()), paddedRowBytes);
    if (!out.good()) return false;
  }
  return out.good();
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_rawimageprocessor_RawImageProcessorModule_nativeExtractRawThumbJpeg(
    JNIEnv *env,
    jobject /* thiz */,
    jstring inputPathJ,
    jstring outputPathJ) {
  if (inputPathJ == nullptr || outputPathJ == nullptr) return nullptr;

  const char *inputPathC = env->GetStringUTFChars(inputPathJ, nullptr);
  const char *outputPathC = env->GetStringUTFChars(outputPathJ, nullptr);
  if (!inputPathC || !outputPathC) {
    if (inputPathC) env->ReleaseStringUTFChars(inputPathJ, inputPathC);
    if (outputPathC) env->ReleaseStringUTFChars(outputPathJ, outputPathC);
    return nullptr;
  }

  std::string inputPath(inputPathC);
  std::string outputPath(outputPathC);
  env->ReleaseStringUTFChars(inputPathJ, inputPathC);
  env->ReleaseStringUTFChars(outputPathJ, outputPathC);

  LibRaw raw;
  int rc = raw.open_file(inputPath.c_str());
  if (rc != LIBRAW_SUCCESS) {
    __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "thumb open_file failed: %s", libraw_strerror(rc));
    return nullptr;
  }

  rc = raw.unpack_thumb();
  if (rc != LIBRAW_SUCCESS) {
    __android_log_print(ANDROID_LOG_INFO, LOG_TAG, "no unpackable thumbnail: %s", libraw_strerror(rc));
    return nullptr;
  }

  int memErr = LIBRAW_SUCCESS;
  libraw_processed_image_t *thumb = raw.dcraw_make_mem_thumb(&memErr);
  if (!thumb || memErr != LIBRAW_SUCCESS) {
    __android_log_print(
        ANDROID_LOG_INFO,
        LOG_TAG,
        "dcraw_make_mem_thumb failed: %s",
        libraw_strerror(memErr));
    if (thumb) LibRaw::dcraw_clear_mem(thumb);
    return nullptr;
  }

  bool ok = false;
  if (thumb->type == LIBRAW_IMAGE_JPEG && thumb->data_size > 0) {
    ok = writeBytes(outputPath, reinterpret_cast<const uint8_t *>(thumb->data), thumb->data_size);
  } else {
    __android_log_print(
        ANDROID_LOG_INFO,
        LOG_TAG,
        "thumbnail type unsupported for fast path: type=%d",
        thumb->type);
  }

  LibRaw::dcraw_clear_mem(thumb);
  if (!ok) return nullptr;
  return env->NewStringUTF(outputPath.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_example_rawimageprocessor_RawImageProcessorModule_nativeConvertRawToBmp(
    JNIEnv *env,
    jobject /* thiz */,
    jstring inputPathJ,
    jstring outputPathJ) {
  if (inputPathJ == nullptr || outputPathJ == nullptr) return nullptr;

  const char *inputPathC = env->GetStringUTFChars(inputPathJ, nullptr);
  const char *outputPathC = env->GetStringUTFChars(outputPathJ, nullptr);
  if (!inputPathC || !outputPathC) {
    if (inputPathC) env->ReleaseStringUTFChars(inputPathJ, inputPathC);
    if (outputPathC) env->ReleaseStringUTFChars(outputPathJ, outputPathC);
    return nullptr;
  }

  std::string inputPath(inputPathC);
  std::string outputPath(outputPathC);
  env->ReleaseStringUTFChars(inputPathJ, inputPathC);
  env->ReleaseStringUTFChars(outputPathJ, outputPathC);

  LibRaw raw;
  raw.imgdata.params.use_camera_wb = 1;
  raw.imgdata.params.output_bps = 8;
  raw.imgdata.params.no_auto_bright = 1;
  raw.imgdata.params.half_size = 0;
  raw.imgdata.params.user_qual = 11;

  int rc = raw.open_file(inputPath.c_str());
  if (rc != LIBRAW_SUCCESS) {
    __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "open_file failed: %s", libraw_strerror(rc));
    return nullptr;
  }

  rc = raw.unpack();
  if (rc != LIBRAW_SUCCESS) {
    __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "unpack failed: %s", libraw_strerror(rc));
    return nullptr;
  }

  __android_log_print(
      ANDROID_LOG_INFO,
      LOG_TAG,
      "sizes after unpack: raw=%ux%u i=%ux%u full=%ux%u",
      raw.imgdata.sizes.raw_width,
      raw.imgdata.sizes.raw_height,
      raw.imgdata.sizes.iwidth,
      raw.imgdata.sizes.iheight,
      raw.imgdata.sizes.width,
      raw.imgdata.sizes.height);
  __android_log_print(
      ANDROID_LOG_INFO,
      LOG_TAG,
      "params before process: half_size=%d user_qual=%d four_color_rgb=%d output_color=%d",
      raw.imgdata.params.half_size,
      raw.imgdata.params.user_qual,
      raw.imgdata.params.four_color_rgb,
      raw.imgdata.params.output_color);

  rc = raw.dcraw_process();
  if (rc != LIBRAW_SUCCESS) {
    __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, "dcraw_process failed: %s", libraw_strerror(rc));
    return nullptr;
  }

  int memErr = LIBRAW_SUCCESS;
  libraw_processed_image_t *img = raw.dcraw_make_mem_image(&memErr);
  if (!img || memErr != LIBRAW_SUCCESS) {
    __android_log_print(
        ANDROID_LOG_ERROR,
        LOG_TAG,
        "dcraw_make_mem_image failed: %s",
        libraw_strerror(memErr));
    if (img) LibRaw::dcraw_clear_mem(img);
    return nullptr;
  }

  __android_log_print(
      ANDROID_LOG_INFO,
      LOG_TAG,
      "processed image: type=%d bits=%u colors=%u size=%ux%u",
      img->type,
      img->bits,
      img->colors,
      img->width,
      img->height);

  bool ok = false;
  if (img->type == LIBRAW_IMAGE_BITMAP && img->bits == 8 && img->colors >= 3) {
    const int width = static_cast<int>(img->width);
    const int height = static_cast<int>(img->height);
    const int stride = static_cast<int>(img->colors) * width;
    ok = writeBmp24(outputPath, width, height, reinterpret_cast<const uint8_t *>(img->data), stride);
  }

  LibRaw::dcraw_clear_mem(img);
  if (!ok) return nullptr;

  return env->NewStringUTF(outputPath.c_str());
}
