#!/usr/bin/perl
# Minimal DynaLoader bridge for MediaRemoteMini.dylib.
# The dylib is BSD-3-Clause; see resources/licenses.
use strict;
use warnings;
use DynaLoader;

my $library = shift @ARGV or die "missing dylib path\n";
my $symbol = shift @ARGV // 'adapter_get_env';
my $handle = DynaLoader::dl_load_file($library, 0)
  or die "cannot load dylib: " . DynaLoader::dl_error() . "\n";
my $address = DynaLoader::dl_find_symbol($handle, $symbol)
  or die "cannot find symbol: $symbol\n";
my $function = DynaLoader::dl_install_xsub("main::$symbol", $address);
&$function();
