# Databases for Augur Cluster
# Includes Redis (and Postgres/rds later)

module "redis" {
  source = "./modules/redis"

  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  subnets                = module.subnets.public_subnet_ids
  allowed_cidr_block     = var.vpc_cidr_block
  allowed_security_group = module.vpc.vpc_default_security_group_id
}
