cmake_minimum_required(VERSION 3.13)

# Define the library name here.
project(tricapp_appmodules)

# This file includes all the necessary to let you build your application with the New Architecture.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

set(LIBRAW_ROOT ${CMAKE_CURRENT_SOURCE_DIR}/libraw/LibRaw-0.22.0)

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
  RawImageProcessorJni.cpp
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
