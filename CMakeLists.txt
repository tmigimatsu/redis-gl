############################################################
# CMakeLists for the redis-gl library.
#
# Copyright 2019. All Rights Reserved.
#
# Created: July 25, 2019
# Authors: Toki Migimatsu
############################################################

# Require 3.6 to support pkg_check_modules IMPORTED_TARGET
cmake_minimum_required(VERSION 3.6)

# Define project
project(redis_gl VERSION 1.0.0 LANGUAGES CXX)

# Define directories
set(REDIS_GL_LIB redis_gl)
set(LIB_CMAKE_DIR ${PROJECT_SOURCE_DIR}/cmake)
set(LIB_INCLUDE_DIR ${PROJECT_SOURCE_DIR}/include)

# Create redis_gl library
add_library(${REDIS_GL_LIB} INTERFACE)

# Create namespaced alias for use inside the build tree
add_library(${REDIS_GL_LIB}::${REDIS_GL_LIB} ALIAS ${REDIS_GL_LIB})

# Set include directories
target_include_directories(${REDIS_GL_LIB}
    INTERFACE
        $<INSTALL_INTERFACE:include>
        $<BUILD_INTERFACE:${LIB_INCLUDE_DIR}>
)

# Use GNUInstalDirs to install ibraries into correct locations on all platforms
include(GNUInstallDirs)

set(REDIS_GL_TARGETS ${REDIS_GL_LIB}Targets)
set(REDIS_GL_CONFIG ${REDIS_GL_LIB}Config)
set(REDIS_GL_CONFIG_INSTALL_DIR ${CMAKE_INSTALL_LIBDIR}/cmake/${REDIS_GL_LIB})

# Install the library
install(TARGETS ${REDIS_GL_LIB}
    EXPORT ${REDIS_GL_TARGETS}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
)

# Install the headers
install(DIRECTORY ${LIB_INCLUDE_DIR} DESTINATION ${CMAKE_INSTALL_INCLUDEDIR})

# Export targets to Targets.cmake
install(EXPORT ${REDIS_GL_TARGETS}
    DESTINATION ${REDIS_GL_CONFIG_INSTALL_DIR}
    NAMESPACE ${REDIS_GL_LIB}::
    FILE ${REDIS_GL_TARGETS}.cmake
)

# Create ConfigVersion.cmake
include(CMakePackageConfigHelpers)
write_basic_package_version_file(${CMAKE_BINARY_DIR}/${REDIS_GL_CONFIG}Version.cmake
    VERSION ${PROJECT_VERSION}
    COMPATIBILITY SameMinorVersion
)

# Create Config.cmake
configure_package_config_file(${LIB_CMAKE_DIR}/${REDIS_GL_CONFIG}.cmake.in
    ${CMAKE_BINARY_DIR}/${REDIS_GL_CONFIG}.cmake
    INSTALL_DESTINATION ${REDIS_GL_CONFIG_INSTALL_DIR})

# Install config script files
install(FILES
    ${CMAKE_BINARY_DIR}/${REDIS_GL_CONFIG}.cmake
    ${CMAKE_BINARY_DIR}/${REDIS_GL_CONFIG}Version.cmake
    DESTINATION ${REDIS_GL_CONFIG_INSTALL_DIR}
)

export(TARGETS ${REDIS_GL_LIB}
    NAMESPACE ${REDIS_GL_LIB}::
    FILE ${CMAKE_BINARY_DIR}/${REDIS_GL_TARGETS}.cmake)

# Register package in user registry
export(PACKAGE ${REDIS_GL_LIB})

