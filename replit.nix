{ pkgs }: {
  deps = [
    # Core Python and Node.js
    pkgs.python311
    pkgs.python311Packages.pip
    pkgs.nodejs-20_x
    
    # System libraries required for ML packages
    # These will be installed via pip in requirements.txt
    pkgs.libuuid
    pkgs.libGL
    pkgs.libGLU
    pkgs.xorg.libSM
    pkgs.xorg.libICE
    pkgs.xorg.libX11
    pkgs.glib
    pkgs.zlib
  ];
  env = {
    PYTHON_LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
      pkgs.libuuid
      pkgs.libGL
      pkgs.libGLU
      pkgs.xorg.libSM
      pkgs.xorg.libICE
      pkgs.xorg.libX11
      pkgs.glib
      pkgs.zlib
    ];
  };
}
