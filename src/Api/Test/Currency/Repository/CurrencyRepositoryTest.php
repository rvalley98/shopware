<?php declare(strict_types=1);

namespace Shopware\Api\Test\Currency\Repository;

use Doctrine\DBAL\Connection;
use Shopware\Api\Currency\Definition\CurrencyDefinition;
use Shopware\Api\Currency\Repository\CurrencyRepository;
use Shopware\Api\Entity\RepositoryInterface;
use Shopware\Api\Entity\Search\Criteria;
use Shopware\Api\Entity\Search\Term\EntityScoreQueryBuilder;
use Shopware\Api\Entity\Search\Term\SearchTermInterpreter;
use Shopware\Context\Struct\ApplicationContext;
use Shopware\Defaults;
use Shopware\Framework\Struct\Uuid;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\DependencyInjection\ContainerInterface;

class CurrencyRepositoryTest extends KernelTestCase
{
    /**
     * @var Connection
     */
    private $connection;

    /**
     * @var ContainerInterface
     */
    private $container;

    /**
     * @var RepositoryInterface
     */
    private $repository;

    public function setUp()
    {
        self::bootKernel();
        $this->container = self::$kernel->getContainer();
        $this->repository = $this->container->get(CurrencyRepository::class);
        $this->connection = $this->container->get(Connection::class);
        $this->connection->beginTransaction();
    }

    protected function tearDown()
    {
        $this->connection->rollBack();
        parent::tearDown();
    }

    public function testSearchRanking()
    {
        $recordA = Uuid::uuid4()->getHex();
        $recordB = Uuid::uuid4()->getHex();

        $records = [
            ['id' => $recordA, 'name' => 'match', 'shortName' => 'test', 'factor' => 1, 'symbol' => 'A'],
            ['id' => $recordB, 'name' => 'not', 'shortName' => 'match', 'factor' => 1, 'symbol' => 'A'],
        ];

        $this->repository->create($records, ApplicationContext::createDefaultContext(Defaults::TENANT_ID));

        $criteria = new Criteria();

        $builder = $this->container->get(EntityScoreQueryBuilder::class);
        $pattern = $this->container->get(SearchTermInterpreter::class)->interpret('match', ApplicationContext::createDefaultContext(Defaults::TENANT_ID));
        $queries = $builder->buildScoreQueries($pattern, CurrencyDefinition::class, CurrencyDefinition::getEntityName());
        $criteria->addQueries($queries);

        $result = $this->repository->searchIds($criteria, ApplicationContext::createDefaultContext(Defaults::TENANT_ID));

        $this->assertCount(2, $result->getIds());

        $this->assertEquals(
            [$recordA, $recordB],
            $result->getIds()
        );

        $this->assertTrue(
            $result->getDataFieldOfId($recordA, 'score')
            >
            $result->getDataFieldOfId($recordB, 'score')
        );
    }
}
