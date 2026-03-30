cmake_minimum_required(VERSION 3.13)
project(rawimageprocessor)

set(JNI_ROOT ${CMAKE_CURRENT_LIST_DIR}/..)
set(LIBRAW_ROOT ${JNI_ROOT}/libraw/LibRaw-0.22.0)

file(GLOB_RECURSE LIBRAW_SOURCES CONFIGURE_DEPENDS
  "${LIBRAW_ROOT}/src/*.cpp"
)

add_library(libraw_static STATIC ${LIBRAW_SOURCES})
target_include_directories(libraw_static PRIVATE
  "${LIBRAW_ROOT}"
  "${LIBRAW_ROOT}/libraw"
  "${LIBRAW_ROOT}/internal"
)
target_compile_definitions(libraw_static PRIVATE
  LIBRAW_NODLL
)
target_compile_options(libraw_static PRIVATE
  -Wno-unused-parameter
  -Wno-unused-variable
  -Wno-missing-field-initializers
)

add_library(rawimageprocessor_jni SHARED
  "${JNI_ROOT}/RawImageProcessorJni.cpp"
)
target_include_directories(rawimageprocessor_jni PRIVATE
  "${LIBRAW_ROOT}"
  "${LIBRAW_ROOT}/libraw"
  "${LIBRAW_ROOT}/internal"
)
target_link_libraries(rawimageprocessor_jni
  libraw_static
  log
)
